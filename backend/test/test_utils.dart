import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:shelf/shelf.dart';
import 'package:venera_server/app_context.dart';
import 'package:venera_server/config.dart';
import 'package:venera_server/db/database.dart';
import 'package:venera_server/server_app.dart';

const testSourceScript = r'''
class TestSource extends ComicSource {
  name = "Test Source";
  key = "test_source";
  version = "1.0.0";
  settings = {
    quality: { type: "select", default: "high", options: [
      { value: "high", text: "High" }, { value: "low", text: "Low" }
    ]}
  };
  search = {
    load: async (keyword, options, page) => ({
      comics: [
        { id: "comic-1", title: keyword + " result", subtitle: "Author",
          cover: "https://example.com/cover.jpg", tags: ["tag1", "tag2"],
          description: "A description" }
      ],
      maxPage: 2
    })
  };
  comic = {
    loadInfo: async (id) => new ComicDetails({
      title: "Comic " + id,
      subtitle: "Author",
      cover: "https://example.com/cover.jpg",
      description: "Description",
      tags: { Tags: ["tag1", "tag2"], author: ["Author"] },
      chapters: { "1": "Chapter 1", "2": "Chapter 2" },
      updateTime: "2024-01-02"
    }),
    loadEp: async (comicId, epId) => ({
      images: [
        "https://example.com/" + comicId + "/" + epId + "/1.jpg",
        "https://example.com/" + comicId + "/" + epId + "/2.jpg"
      ]
    }),
    onImageLoad: (url) => ({
      url: url,
      headers: { Referer: "https://example.com/" }
    })
  };
}
''';

const htmlSourceScript = r'''
class HtmlSource extends ComicSource {
  name = "Html Source";
  key = "html_source";
  version = "1.0.0";
  search = {
    load: async (keyword) => {
      const doc = new HtmlDocument('<div class="list"><a href="/c/1" id="one">Hello <b>World</b></a><a href="/c/2">Second</a></div>');
      const first = doc.querySelector('a');
      const all = doc.querySelectorAll('div.list a');
      const md5 = Convert.hexEncode(Convert.md5("abc"));
      const out = {
        id: "1",
        title: first.text + "|" + first.attributes.href + "|" + all.length + "|" + md5 + "|" + APP.locale,
        cover: ""
      };
      doc.dispose();
      return { comics: [out], maxPage: 1 };
    }
  };
  comic = { loadInfo: async (id) => new ComicDetails({ title: "x", chapters: {} }) };
}
''';

class TestApp {
  final Directory dir;
  final Config config;
  final Db db;
  final AppContext ctx;
  final Handler handler;

  TestApp._(this.dir, this.config, this.db, this.ctx, this.handler);

  static TestApp create(
      {String jsBin = '../rust/js_host/target/debug/venera_js_host',
      Map<String, String> env = const {}}) {
    final dir = Directory.systemTemp.createTempSync('venera_test_');
    final dataDir = Directory('${dir.path}/data')..createSync(recursive: true);
    final config = Config.fromEnv({
      'DATA_DIR': dataDir.path,
      'DB_PATH': '${dataDir.path}/venera.db',
      'JS_HOST_BIN': jsBin,
      'STATIC_DIR': '${dir.path}/static',
      'RATE_LIMIT_PER_MINUTE': '100000',
      'SESSION_SECRET': 'test-session-secret-0123456789abcdef',
      'APP_ENV': 'development',
      'LOG_LEVEL': 'error',
      ...env,
    });
    final db = Db.open(config.dbPath);
    final ctx = AppContext(config, db);
    final handler = buildServerHandler(ctx);
    return TestApp._(dir, config, db, ctx, handler);
  }

  Future<void> dispose() async {
    await ctx.dispose();
    try {
      dir.deleteSync(recursive: true);
    } catch (_) {}
  }

  Client client() => Client(handler);
}

class Client {
  final Handler handler;
  String? cookie;

  Client(this.handler);

  Future<({int status, Map<String, Object?> body})> request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? headers,
    bool raw = false,
  }) async {
    final requestHeaders = <String, String>{
      if (!raw) 'content-type': 'application/json',
      if (cookie != null) 'cookie': cookie!,
      ...?headers,
    };
    final request = Request(
      method,
      Uri.parse('http://localhost:18080$path'),
      headers: requestHeaders,
      body: raw ? body : (body == null ? null : jsonEncode(body)),
    );
    final response = await handler(request);
    final text = await response.readAsString();
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null) {
      cookie = setCookie.split(';').first;
    }
    Object? decoded;
    try {
      decoded = jsonDecode(text);
    } catch (_) {
      decoded = text;
    }
    return (
      status: response.statusCode,
      body: decoded is Map
          ? decoded.map((k, v) => MapEntry(k.toString(), v))
          : <String, Object?>{'data': decoded},
    );
  }

  Future<({int status, Uint8List bytes, Map<String, String> headers})>
      rawRequest(String method, String path) async {
    final request = Request(
      method,
      Uri.parse('http://localhost:18080$path'),
      headers: {
        if (cookie != null) 'cookie': cookie!,
      },
    );
    final response = await handler(request);
    final bytes = Uint8List.fromList(
        await response.read().expand((chunk) => chunk).toList());
    return (
      status: response.statusCode,
      bytes: bytes,
      headers: response.headers
    );
  }

  Future<({int status, Map<String, Object?> body})> get(String path) =>
      request('GET', path);

  Future<({int status, Map<String, Object?> body})> post(String path,
          [Object? body]) =>
      request('POST', path, body: body);

  Future<({int status, Map<String, Object?> body})> put(String path,
          [Object? body]) =>
      request('PUT', path, body: body);

  Future<({int status, Map<String, Object?> body})> patch(String path,
          [Object? body]) =>
      request('PATCH', path, body: body);

  Future<({int status, Map<String, Object?> body})> delete(String path,
          [Object? body]) =>
      request('DELETE', path, body: body);

  Future<void> login(String username, String password) async {
    final result = await post(
        '/api/auth/login', {'username': username, 'password': password});
    if (result.status != 200) {
      throw StateError('Login failed: ${result.body}');
    }
  }

  Future<void> init(String username, String password) async {
    final result =
        await post('/api/init', {'username': username, 'password': password});
    if (result.status != 200) {
      throw StateError('Init failed: ${result.body}');
    }
  }
}
