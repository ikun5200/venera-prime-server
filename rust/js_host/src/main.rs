//! Venera JS host: a QuickJS sidecar that runs the original `init.js` and
//! user comic-source scripts. One runtime per request; interrupt-based
//! timeout; 256 MiB memory limit; JSON-lines protocol on stdio.

use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{self, BufRead, Write};
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use aes::cipher::{BlockDecrypt, BlockEncrypt, KeyInit};
use aes::{Aes128, Aes192, Aes256};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use cookie::Cookie;
use ego_tree::NodeId;
use encoding_rs::GBK;
use hmac::{Hmac, Mac};
use rand::Rng;
use rquickjs::{Context, Function, Runtime};
use rsa::pkcs8::DecodePrivateKey;
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey};
use scraper::{Element, ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const INIT_JS: &str = include_str!("../assets/init.js");

const PRELUDE: &str = r#"
globalThis.__asyncMethods = new Set(['http','delay','UI','getClipboard','compute','setClipboard']);
globalThis.__toHost = function(v) {
  if (v === undefined || v === null) return null;
  const t = typeof v;
  if (t === 'function' || t === 'symbol') return undefined;
  if (t === 'bigint') return v.toString();
  if (t !== 'object') return v;
  if (v instanceof ArrayBuffer) return {__bytes: Array.from(new Uint8Array(v))};
  if (ArrayBuffer.isView(v)) return {__bytes: Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))};
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Map) {
    const o = {};
    for (const [k, val] of v) o[String(k)] = __toHost(val);
    return o;
  }
  if (v instanceof Set) return Array.from(v).map(x => __toHost(x));
  if (Array.isArray(v)) return v.map(x => __toHost(x));
  const o = {};
  for (const k of Object.keys(v)) {
    const val = __toHost(v[k]);
    if (val !== undefined) o[k] = val;
  }
  return o;
};
globalThis.__fromHost = function(s) {
  return JSON.parse(s, (k, v) =>
    (v && typeof v === 'object' && Array.isArray(v.__bytes))
      ? new Uint8Array(v.__bytes).buffer
      : v);
};
globalThis.__hostCall = function(msg) {
  const r = __fromHost(__nativeHost(JSON.stringify(__toHost(msg))));
  if (r && typeof r === 'object' && r.__hostError) throw new Error(r.__hostError);
  return r;
};
globalThis.sendMessage = function(msg) {
  const r = __hostCall(msg);
  if (msg && __asyncMethods.has(msg.method)) return Promise.resolve(r);
  return r;
};
"#;

const PATCH: &str = r#"
if (!Object.getOwnPropertyDescriptor(HtmlElement.prototype, 'innerHtml')) {
  Object.defineProperty(HtmlElement.prototype, 'innerHtml', {
    get() { return this.innerHTML; },
    configurable: true,
  });
}
// `compute` runs in the same runtime; no isolate pool is needed.
globalThis.compute = function(func, ...args) {
  return Promise.resolve().then(() => {
    const fn = (0, eval)('(' + func + ')');
    return fn(...args);
  });
};
"#;

const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CookieRec {
    name: String,
    value: String,
    domain: String,
    #[serde(default = "default_path")]
    path: String,
    #[serde(default)]
    expires: Option<i64>,
    #[serde(default)]
    secure: bool,
    #[serde(rename = "httpOnly", default)]
    http_only: bool,
    #[serde(rename = "hostOnly", default = "default_true")]
    host_only: bool,
}

fn default_path() -> String {
    "/".to_string()
}
fn default_true() -> bool {
    true
}

struct LogEntry {
    level: String,
    title: String,
    content: String,
}

struct HtmlDoc {
    html: Html,
    elements: Vec<NodeId>,
    nodes: Vec<NodeId>,
}

struct HostState {
    data: Value,
    settings: Value,
    cookies: Vec<CookieRec>,
    locale: String,
    platform: String,
    logs: Vec<LogEntry>,
    clipboard: Option<String>,
    docs: HashMap<i64, HtmlDoc>,
}

impl HostState {
    fn new(context: &Value) -> Self {
        let cookies = context
            .get("cookies")
            .cloned()
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        HostState {
            data: context.get("data").cloned().unwrap_or_else(|| json!({})),
            settings: context
                .get("settings")
                .cloned()
                .unwrap_or_else(|| json!({})),
            cookies,
            locale: context
                .get("locale")
                .and_then(|v| v.as_str())
                .unwrap_or("en_US")
                .to_string(),
            platform: context
                .get("platform")
                .and_then(|v| v.as_str())
                .unwrap_or("linux")
                .to_string(),
            logs: Vec::new(),
            clipboard: None,
            docs: HashMap::new(),
        }
    }

    fn log(&mut self, level: &str, title: &str, content: String) {
        if self.logs.len() < 500 {
            self.logs.push(LogEntry {
                level: level.to_string(),
                title: title.to_string(),
                content,
            });
        }
    }

    fn data_get(&self, key: &str) -> Value {
        self.data.get(key).cloned().unwrap_or(Value::Null)
    }

    fn data_set(&mut self, key: &str, value: Value) {
        if !self.data.is_object() {
            self.data = json!({});
        }
        self.data[key] = value;
    }

    fn data_delete(&mut self, key: &str) {
        if let Some(obj) = self.data.as_object_mut() {
            obj.remove(key);
        }
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = Arc::new(Mutex::new(io::stdout()));
    let mut handles = Vec::new();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let out = stdout.clone();
        handles.push(std::thread::spawn(move || {
            let response = handle_line(&line);
            if let Ok(text) = serde_json::to_string(&response) {
                if let Ok(mut lock) = out.lock() {
                    let _ = writeln!(lock, "{}", text);
                    let _ = lock.flush();
                }
            }
        }));
    }
    for handle in handles {
        let _ = handle.join();
    }
}

fn handle_line(line: &str) -> Value {
    let request: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(error) => {
            return json!({
                "id": null,
                "ok": false,
                "error": {"code": "BAD_REQUEST", "message": format!("Invalid JSON: {error}")}
            })
        }
    };
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let timeout_ms = request
        .get("timeoutMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(30_000);
    match run_request(&request, timeout_ms) {
        Ok(mut result) => {
            result["id"] = id;
            result["ok"] = json!(true);
            result
        }
        Err((code, message)) => json!({
            "id": id,
            "ok": false,
            "error": {"code": code, "message": message}
        }),
    }
}

type HostResult<T> = Result<T, (String, String)>;

fn host_err(message: impl Into<String>) -> (String, String) {
    ("JS_ERROR".to_string(), message.into())
}

fn run_request(request: &Value, timeout_ms: u64) -> HostResult<Value> {
    let rt = Runtime::new().map_err(|e| ("INTERNAL".into(), e.to_string()))?;
    rt.set_memory_limit(256 * 1024 * 1024);
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    rt.set_interrupt_handler(Some(Box::new(move || Instant::now() > deadline)));
    let ctx = Context::full(&rt).map_err(|e| ("INTERNAL".into(), e.to_string()))?;

    let state = Rc::new(RefCell::new(HostState::new(
        request.get("context").unwrap_or(&Value::Null),
    )));

    let outcome = ctx.with(|ctx| run_in_context(&ctx, request, state.clone(), deadline));

    let mut response = match outcome {
        Ok(value) => value,
        Err(error) => return Err(error),
    };
    response["data"] = state.borrow().data.clone();
    response["cookies"] =
        serde_json::to_value(&state.borrow().cookies).unwrap_or_else(|_| json!([]));
    response["logs"] = json!(state
        .borrow()
        .logs
        .iter()
        .map(|l| json!({
            "level": l.level,
            "title": l.title,
            "content": l.content,
        }))
        .collect::<Vec<_>>());
    Ok(response)
}

fn run_in_context(
    ctx: &rquickjs::Ctx<'_>,
    request: &Value,
    state: Rc<RefCell<HostState>>,
    deadline: Instant,
) -> HostResult<Value> {
    let host_state = state.clone();
    let native = Function::new(ctx.clone(), move |input: String| -> String {
        let msg: Value = serde_json::from_str(&input).unwrap_or(Value::Null);
        let value = match host_call(&host_state, &msg) {
            Ok(value) => value,
            Err(error) => json!({"__hostError": error}),
        };
        serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string())
    })
    .map_err(|e| ("INTERNAL".to_string(), e.to_string()))?;
    ctx.globals()
        .set("__nativeHost", native)
        .map_err(|e| ("INTERNAL".to_string(), e.to_string()))?;

    ctx.eval::<(), _>(PRELUDE)
        .map_err(|e| ("INTERNAL".to_string(), format!("prelude: {e}")))?;
    ctx.eval::<(), _>(INIT_JS)
        .map_err(|e| ("INTERNAL".to_string(), format!("init.js: {e}")))?;
    ctx.eval::<(), _>(PATCH)
        .map_err(|e| ("INTERNAL".to_string(), format!("patch: {e}")))?;

    let op = request
        .get("op")
        .and_then(|v| v.as_str())
        .unwrap_or("call");

    if op == "run" {
        let code = request
            .get("script")
            .and_then(|v| v.as_str())
            .unwrap_or("null");
        let literal = serde_json::to_string(code).unwrap();
        let wrapped = format!("JSON.stringify(__toHost(eval({literal})))");
        let result: String = ctx
            .eval(wrapped)
            .map_err(|e| host_err(format!("run: {e}")))?;
        let value: Value = serde_json::from_str(&result).unwrap_or(Value::Null);
        return Ok(json!({"result": value}));
    }

    let script = request
        .get("script")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ("BAD_REQUEST".to_string(), "script is required".to_string()))?;

    let class_name = find_class_name(script).ok_or_else(|| {
        (
            "PARSE_ERROR".to_string(),
            "class ... extends ComicSource not found at column 0".to_string(),
        )
    })?;

    ctx.eval::<(), _>(script)
        .map_err(|e| ("PARSE_ERROR".to_string(), format!("script eval: {e}")))?;

    let key = request
        .get("context")
        .and_then(|c| c.get("sourceKey"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let setup = format!(
        r#"
globalThis.__src = new {class_name}();
if (!__src.key) throw new Error('Source key is missing');
ComicSource.sources[__src.key] = __src;
"#
    );
    ctx.eval::<(), _>(setup)
        .map_err(|e| ("PARSE_ERROR".to_string(), format!("instantiate: {e}")))?;

    if op == "parse" {
        let meta_code = r#"
(() => {
  const s = globalThis.__src;
  const c = s.comic || {};
  const a = s.account || {};
  return JSON.stringify(__toHost({
    name: s.name,
    key: s.key,
    version: s.version,
    url: s.url || '',
    minAppVersion: s.minAppVersion || '',
    settings: s.settings || {},
    translation: s.translation || {},
    capabilities: {
      search: !!s.search,
      explore: !!s.explore,
      category: !!s.category,
      categoryComics: !!s.categoryComics,
      favorites: !!s.favorites,
      comments: !!c.loadComments,
      chapterComments: !!c.loadChapterComments,
      sendComment: !!c.sendComment,
      sendChapterComment: !!c.sendChapterComment,
      thumbnails: !!c.loadThumbnails,
      archive: !!c.archive,
      like: !!c.likeComic,
      starRating: !!c.starRating,
      link: !!c.link,
      imageLoad: !!c.onImageLoad,
      thumbnailLoad: !!c.onThumbnailLoad,
      login: !!(a.login || a.loginWithCookies || a.loginWithWebview),
      passwordLogin: !!a.login,
      cookieLogin: !!a.loginWithCookies,
      webviewLogin: !!a.loginWithWebview,
      logout: !!a.logout,
      register: !!a.registerWebsite,
      tagsSuggestions: !!(s.search && s.search.enableTagsSuggestions),
      tagSuggestionSelect: !!(s.search && s.search.onTagSuggestionSelected),
    },
    account: Object.keys(a),
    cookieFields: (a.loginWithCookies && a.loginWithCookies.fields) || null,
    webviewLoginUrl: (a.loginWithWebview && a.loginWithWebview.url) || null,
    registerWebsite: a.registerWebsite || null,
    explore: (s.explore || []).map(e => ({title: e.title, type: e.type})),
    searchOptions: (s.search && s.search.optionList) || null,
    category: s.category ? {
      title: s.category.title,
      enableRankingPage: !!s.category.enableRankingPage,
      parts: (s.category.parts || []).map(p => ({
        name: p.name,
        type: p.type,
        randomNumber: p.randomNumber,
        categories: p.categories,
        itemType: p.itemType,
        categoryParams: p.categoryParams,
        groupParam: p.groupParam,
      })),
    } : null,
    categoryComics: s.categoryComics ? {
      optionList: s.categoryComics.optionList || null,
      rankingOptions: (s.categoryComics.ranking && s.categoryComics.ranking.options) || null,
    } : null,
    favorites: s.favorites ? {
      multiFolder: !!s.favorites.multiFolder,
      isOldToNewSort: !!s.favorites.isOldToNewSort,
      singleFolderForSingleComic: !!s.favorites.singleFolderForSingleComic,
    } : null,
    linkDomains: (c.link && c.link.domains) || null,
    idMatch: c.idMatch || null,
  }));
})()
"#;
        let meta_json: String = ctx
            .eval(meta_code)
            .map_err(|e| ("PARSE_ERROR".to_string(), format!("metadata: {e}")))?;
        let meta: Value = serde_json::from_str(&meta_json)
            .map_err(|e| ("PARSE_ERROR".to_string(), format!("metadata json: {e}")))?;
        let meta_key = meta
            .get("key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if meta_key.is_empty() {
            return Err((
                "PARSE_ERROR".to_string(),
                "Source key is required".to_string(),
            ));
        }
        if !meta_key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
        {
            return Err((
                "PARSE_ERROR".to_string(),
                "Source key may only contain letters, digits and underscore".to_string(),
            ));
        }
        if !key.is_empty() && key != meta_key {
            return Err((
                "PARSE_ERROR".to_string(),
                format!("Source key changed: expected {key}, got {meta_key}"),
            ));
        }
        let init_code = r#"
(async () => {
  try {
    if (globalThis.__src && typeof globalThis.__src.init === 'function') {
      await globalThis.__src.init();
    }
  } catch (e) {}
})();
"#;
        let _ = ctx.eval::<(), _>(init_code);
        drain_jobs(ctx, deadline, 200);
        return Ok(json!({"result": meta, "meta": meta}));
    }

    if op == "image_config" {
        let args = request.get("args").cloned().unwrap_or_else(|| json!([]));
        let args_literal = serde_json::to_string(&args.to_string()).unwrap();
        let code = format!(
            r#"
globalThis.__done = 0;
globalThis.__result = null;
globalThis.__error = null;
(async () => {{
  try {{
    const src = globalThis.__src;
    if (!src || !src.comic || typeof src.comic.onImageLoad !== 'function') {{
      globalThis.__result = JSON.stringify([]);
    }} else {{
      const args = JSON.parse({args_literal});
      let cfg = await src.comic.onImageLoad.apply(src.comic, args);
      const list = [];
      let guard = 0;
      while (cfg && guard < 6) {{
        const copy = {{}};
        for (const k of Object.keys(cfg)) {{
          if (k !== 'onLoadFailed') copy[k] = cfg[k];
        }}
        list.push(__toHost(copy));
        if (typeof cfg.onLoadFailed === 'function') {{
          try {{ cfg = await cfg.onLoadFailed(); }} catch (e) {{ break; }}
        }} else {{
          break;
        }}
        guard++;
      }}
      globalThis.__result = JSON.stringify(list);
    }}
  }} catch (e) {{
    globalThis.__error = String((e && e.stack) || e);
  }} finally {{
    globalThis.__done = 1;
  }}
}})();
"#
        );
        ctx.eval::<(), _>(code)
            .map_err(|e| ("JS_ERROR".to_string(), format!("image config: {e}")))?;
        let mut idle = 0;
        loop {
            let done: i32 = ctx.globals().get::<_, i32>("__done").unwrap_or(0);
            if done != 0 {
                break;
            }
            if Instant::now() > deadline {
                return Err(("TIMEOUT".to_string(), "Source timed out".to_string()));
            }
            if ctx.execute_pending_job() {
                idle = 0;
                continue;
            }
            idle += 1;
            if idle > 500 {
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        let error: Option<String> = ctx
            .globals()
            .get::<_, Option<String>>("__error")
            .ok()
            .flatten();
        if let Some(error) = error {
            return Err(("JS_ERROR".to_string(), error));
        }
        let result: Option<String> = ctx
            .globals()
            .get::<_, Option<String>>("__result")
            .ok()
            .flatten();
        let value = result
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_else(|| json!([]));
        return Ok(json!({"result": value}));
    }

    let method = request
        .get("method")
        .and_then(|v| v.as_str())
        .ok_or_else(|| ("BAD_REQUEST".to_string(), "method is required".to_string()))?;
    let args = request.get("args").cloned().unwrap_or_else(|| json!([]));
    let args_literal = serde_json::to_string(&args.to_string()).unwrap();
    let method_literal = serde_json::to_string(method).unwrap();
    let call_code = format!(
        r#"
globalThis.__done = 0;
globalThis.__result = null;
globalThis.__error = null;
(async () => {{
  try {{
    const src = globalThis.__src;
    if (!src) throw new Error('Source is not registered');
    if (typeof src.init === 'function') {{
      try {{ await src.init(); }} catch (e) {{}}
    }}
    const parts = {method_literal}.split('.');
    let recv = src;
    for (let i = 0; i < parts.length - 1; i++) {{
      recv = recv == null ? undefined : recv[parts[i]];
    }}
    if (recv == null) throw new Error('Method not found: ' + {method_literal});
    const fn = recv[parts[parts.length - 1]];
    if (typeof fn !== 'function') throw new Error('Method not found: ' + {method_literal});
    const args = JSON.parse({args_literal});
    const res = await fn.apply(recv, args);
    globalThis.__result = JSON.stringify(__toHost(res === undefined ? null : res));
  }} catch (e) {{
    globalThis.__error = String((e && e.stack) || e);
  }} finally {{
    globalThis.__done = 1;
  }}
}})();
"#
    );
    ctx.eval::<(), _>(call_code)
        .map_err(|e| ("JS_ERROR".to_string(), format!("call setup: {e}")))?;

    let mut idle = 0;
    loop {
        let done: i32 = ctx.globals().get::<_, i32>("__done").unwrap_or(0);
        if done != 0 {
            break;
        }
        if Instant::now() > deadline {
            return Err(("TIMEOUT".to_string(), "Source timed out".to_string()));
        }
        if ctx.execute_pending_job() {
            idle = 0;
            continue;
        }
        idle += 1;
        if idle > 500 {
            break;
        }
        std::thread::sleep(Duration::from_millis(1));
    }

    let error: Option<String> = ctx
        .globals()
        .get::<_, Option<String>>("__error")
        .ok()
        .flatten();
    if let Some(error) = error {
        return Err(("JS_ERROR".to_string(), error));
    }
    let result: Option<String> = ctx
        .globals()
        .get::<_, Option<String>>("__result")
        .ok()
        .flatten();
    let value = match result {
        Some(text) => serde_json::from_str(&text).unwrap_or(Value::Null),
        None => Value::Null,
    };
    Ok(json!({"result": value}))
}

fn drain_jobs(ctx: &rquickjs::Ctx<'_>, deadline: Instant, max_idle: usize) {
    let mut idle = 0;
    while Instant::now() < deadline {
        if ctx.execute_pending_job() {
            idle = 0;
        } else {
            idle += 1;
            if idle > max_idle {
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
    }
}

fn find_class_name(script: &str) -> Option<String> {
    for line in script.lines() {
        if !line.starts_with("class ") {
            continue;
        }
        if !line.contains("extends ComicSource") {
            continue;
        }
        let rest = line.strip_prefix("class ")?;
        let name = rest.split_whitespace().next()?;
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Host bridge
// ---------------------------------------------------------------------------

fn host_call(state: &Rc<RefCell<HostState>>, msg: &Value) -> Result<Value, String> {
    let method = msg
        .get("method")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "method is required".to_string())?;
    match method {
        "log" => {
            let level = msg
                .get("level")
                .and_then(|v| v.as_str())
                .unwrap_or("warning");
            let title = msg.get("title").and_then(|v| v.as_str()).unwrap_or("");
            let content = match msg.get("content") {
                Some(Value::String(s)) => s.clone(),
                Some(v) => v.to_string(),
                None => String::new(),
            };
            state.borrow_mut().log(level, title, content);
            Ok(Value::Null)
        }
        "load_data" => {
            let key = msg.get("data_key").and_then(|v| v.as_str()).unwrap_or("");
            Ok(state.borrow().data_get(key))
        }
        "save_data" => {
            let key = msg.get("data_key").and_then(|v| v.as_str()).unwrap_or("");
            if key == "setting" {
                return Err("setting is not allowed to be saved".to_string());
            }
            let value = msg.get("data").cloned().unwrap_or(Value::Null);
            state.borrow_mut().data_set(key, value);
            Ok(Value::Null)
        }
        "delete_data" => {
            let key = msg.get("data_key").and_then(|v| v.as_str()).unwrap_or("");
            state.borrow_mut().data_delete(key);
            Ok(Value::Null)
        }
        "http" => http_call(state, msg),
        "html" => html_call(state, msg),
        "convert" => Ok(convert(msg)),
        "random" => {
            let min = msg.get("min").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let max = msg.get("max").and_then(|v| v.as_f64()).unwrap_or(1.0);
            let kind = msg.get("type").and_then(|v| v.as_str()).unwrap_or("int");
            let mut rng = rand::thread_rng();
            let value = min + (max - min) * rng.gen::<f64>();
            if kind == "double" {
                Ok(json!(value))
            } else {
                Ok(json!(value as i64))
            }
        }
        "cookie" => cookie_call(state, msg),
        "uuid" => Ok(json!(random_uuid())),
        "load_setting" => {
            let key = msg
                .get("setting_key")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let st = state.borrow();
            if let Some(saved) = st.data.get("settings").and_then(|v| v.get(key)) {
                if !saved.is_null() {
                    return Ok(saved.clone());
                }
            }
            if let Some(default) = st.settings.get(key).and_then(|v| v.get("default")) {
                return Ok(default.clone());
            }
            Ok(Value::Null)
        }
        "isLogged" => {
            let logged = state
                .borrow()
                .data
                .get("account")
                .map(|v| !v.is_null())
                .unwrap_or(false);
            Ok(json!(logged))
        }
        "delay" => {
            let ms = msg.get("time").and_then(|v| v.as_u64()).unwrap_or(0);
            std::thread::sleep(Duration::from_millis(ms.min(30_000)));
            Ok(Value::Null)
        }
        "UI" => {
            let function = msg
                .get("function")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match function {
                "showLoading" => Ok(json!(0)),
                "showMessage" => {
                    let text = msg.get("message").and_then(|v| v.as_str()).unwrap_or("");
                    state
                        .borrow_mut()
                        .log("info", "UI", text.to_string());
                    Ok(Value::Null)
                }
                "launchUrl" => {
                    let url = msg.get("url").and_then(|v| v.as_str()).unwrap_or("");
                    state
                        .borrow_mut()
                        .log("info", "UI", format!("launchUrl: {url}"));
                    Ok(Value::Null)
                }
                _ => Ok(Value::Null),
            }
        }
        "getLocale" => Ok(json!(state.borrow().locale.clone())),
        "getPlatform" => Ok(json!(state.borrow().platform.clone())),
        "setClipboard" => {
            let text = msg.get("text").and_then(|v| v.as_str()).unwrap_or("");
            state.borrow_mut().clipboard = Some(text.to_string());
            Ok(Value::Null)
        }
        "getClipboard" => Ok(match &state.borrow().clipboard {
            Some(text) => json!(text),
            None => Value::Null,
        }),
        other => Err(format!("Unsupported host method: {other}")),
    }
}

// ---------------------------------------------------------------------------
// HTTP + cookies
// ---------------------------------------------------------------------------

fn http_call(state: &Rc<RefCell<HostState>>, msg: &Value) -> Result<Value, String> {
    let url = msg
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "url is required".to_string())?;
    let method = msg
        .get("http_method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET")
        .to_uppercase();
    let mut headers: Vec<(String, String)> = Vec::new();
    if let Some(obj) = msg.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in obj {
            if v.is_null() {
                continue;
            }
            let value = match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            headers.push((k.clone(), value));
        }
    }
    if !headers
        .iter()
        .any(|(k, _)| k.eq_ignore_ascii_case("user-agent"))
    {
        headers.push(("User-Agent".to_string(), WEB_UA.to_string()));
    }
    let cookie_header = {
        let st = state.borrow();
        cookie_header_for(&st.cookies, url)
    };
    if let Some(cookie) = cookie_header {
        headers.push(("Cookie".to_string(), cookie));
    }

    let body = msg.get("data").and_then(bytes_from_value);
    let want_bytes = msg.get("bytes").and_then(|v| v.as_bool()).unwrap_or(false);

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_millis(15_000))
        .timeout_read(Duration::from_millis(25_000))
        .timeout_write(Duration::from_millis(25_000))
        .redirects(10)
        .build();

    let mut request = agent.request(&method, url);
    for (k, v) in &headers {
        request = request.set(k, v);
    }

    let response = if let Some(bytes) = body {
        request.send_bytes(&bytes)
    } else {
        request.call()
    };

    let (status, resp) = match response {
        Ok(resp) => (resp.status() as i64, resp),
        Err(ureq::Error::Status(code, resp)) => (code as i64, resp),
        Err(ureq::Error::Transport(error)) => {
            return Ok(json!({
                "status": Value::Null,
                "headers": {},
                "body": Value::Null,
                "error": error.to_string(),
            }));
        }
    };

    let mut response_headers = serde_json::Map::new();
    let mut set_cookies: Vec<String> = Vec::new();
    for name in resp.headers_names() {
        let values = resp.all(&name);
        if name.eq_ignore_ascii_case("set-cookie") {
            set_cookies.extend(values.iter().map(|v| v.to_string()));
        }
        response_headers.insert(name.clone(), json!(values.join(",")));
    }

    let mut buffer = Vec::new();
    let mut reader = resp.into_reader();
    use std::io::Read;
    let _ = reader.read_to_end(&mut buffer);

    {
        let mut st = state.borrow_mut();
        for header in set_cookies {
            store_set_cookie(&mut st.cookies, url, &header);
        }
    }

    let body_value = if want_bytes {
        json!({"__bytes": buffer})
    } else {
        json!(String::from_utf8_lossy(&buffer).to_string())
    };

    Ok(json!({
        "status": status,
        "headers": response_headers,
        "body": body_value,
        "error": Value::Null,
    }))
}

fn cookie_matches(cookie: &CookieRec, host: &str, path: &str, secure: bool) -> bool {
    if cookie.secure && !secure {
        return false;
    }
    let domain = cookie.domain.trim_start_matches('.');
    let domain_ok = if cookie.host_only {
        host.eq_ignore_ascii_case(domain)
    } else {
        host.eq_ignore_ascii_case(domain)
            || (host.len() > domain.len()
                && host
                    .to_ascii_lowercase()
                    .ends_with(&format!(".{}", domain.to_ascii_lowercase())))
    };
    if !domain_ok {
        return false;
    }
    let cookie_path = if cookie.path.is_empty() {
        "/"
    } else {
        cookie.path.as_str()
    };
    path.starts_with(cookie_path)
}

fn cookie_header_for(cookies: &[CookieRec], url: &str) -> Option<String> {
    let parsed = UrlParts::parse(url)?;
    let now = now_ms();
    let mut pairs = Vec::new();
    for cookie in cookies {
        if let Some(expires) = cookie.expires {
            if expires > 0 && expires < now {
                continue;
            }
        }
        if cookie_matches(cookie, &parsed.host, &parsed.path, parsed.secure) {
            pairs.push(format!("{}={}", cookie.name, cookie.value));
        }
    }
    if pairs.is_empty() {
        None
    } else {
        Some(pairs.join("; "))
    }
}

fn store_set_cookie(cookies: &mut Vec<CookieRec>, url: &str, header: &str) {
    let parsed_url = match UrlParts::parse(url) {
        Some(u) => u,
        None => return,
    };
    let parsed = match Cookie::parse(header.to_string()) {
        Ok(c) => c,
        Err(_) => return,
    };
    let name = parsed.name().to_string();
    if name.is_empty() {
        return;
    }
    let (domain, host_only) = match parsed.domain() {
        Some(d) => (d.to_string(), false),
        None => (parsed_url.host.clone(), true),
    };
    let path = parsed.path().unwrap_or("/").to_string();
    let expires = if let Some(max_age) = parsed.max_age() {
        Some(now_ms() + max_age.whole_seconds() * 1000)
    } else {
        match parsed.expires() {
            Some(cookie::Expiration::DateTime(dt)) => {
                Some((dt.unix_timestamp_nanos() / 1_000_000) as i64)
            }
            _ => None,
        }
    };
    let record = CookieRec {
        name: name.clone(),
        value: parsed.value().to_string(),
        domain,
        path,
        expires,
        secure: parsed.secure().unwrap_or(false),
        http_only: parsed.http_only().unwrap_or(false),
        host_only,
    };
    cookies.retain(|c| {
        !(c.name == record.name
            && c.domain.eq_ignore_ascii_case(&record.domain)
            && c.path == record.path)
    });
    cookies.push(record);
}

fn cookie_call(state: &Rc<RefCell<HostState>>, msg: &Value) -> Result<Value, String> {
    let function = msg.get("function").and_then(|v| v.as_str()).unwrap_or("");
    let url = msg.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let parsed = UrlParts::parse(url);
    match function {
        "set" => {
            let host = parsed
                .as_ref()
                .map(|p| p.host.clone())
                .unwrap_or_default();
            if let Some(list) = msg.get("cookies").and_then(|v| v.as_array()) {
                let mut st = state.borrow_mut();
                for item in list {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    if name.is_empty() {
                        continue;
                    }
                    let value = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    let domain = item
                        .get("domain")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let host_only = domain.is_none();
                    let record = CookieRec {
                        name: name.to_string(),
                        value: value.to_string(),
                        domain: domain.unwrap_or_else(|| host.clone()),
                        path: "/".to_string(),
                        expires: None,
                        secure: parsed.as_ref().map(|p| p.secure).unwrap_or(false),
                        http_only: false,
                        host_only,
                    };
                    st.cookies.retain(|c| {
                        !(c.name == record.name
                            && c.domain.eq_ignore_ascii_case(&record.domain)
                            && c.path == record.path)
                    });
                    st.cookies.push(record);
                }
            }
            Ok(Value::Null)
        }
        "get" => {
            let st = state.borrow();
            let now = now_ms();
            let list: Vec<Value> = st
                .cookies
                .iter()
                .filter(|c| {
                    parsed
                        .as_ref()
                        .map(|p| cookie_matches(c, &p.host, &p.path, p.secure))
                        .unwrap_or(false)
                })
                .filter(|c| c.expires.map(|e| e == 0 || e > now).unwrap_or(true))
                .map(|c| {
                    json!({
                        "name": c.name,
                        "value": c.value,
                        "domain": c.domain,
                        "path": c.path,
                        "expires": c.expires,
                        "max-age": Value::Null,
                        "secure": c.secure,
                        "httpOnly": c.http_only,
                        "session": c.expires.is_none(),
                    })
                })
                .collect();
            Ok(json!(list))
        }
        "delete" => {
            let host = parsed
                .as_ref()
                .map(|p| p.host.clone())
                .unwrap_or_default();
            let mut st = state.borrow_mut();
            st.cookies
                .retain(|c| !c.domain.trim_start_matches('.').eq_ignore_ascii_case(&host));
            Ok(Value::Null)
        }
        _ => Ok(Value::Null),
    }
}

struct UrlParts {
    host: String,
    path: String,
    secure: bool,
}

impl UrlParts {
    fn parse(url: &str) -> Option<Self> {
        let (scheme, rest) = url.split_once("://")?;
        let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
        let authority = &rest[..authority_end];
        let host = authority
            .rsplit('@')
            .next()
            .unwrap_or(authority)
            .split(':')
            .next()
            .unwrap_or("")
            .to_string();
        if host.is_empty() {
            return None;
        }
        let tail = &rest[authority_end..];
        let path = if tail.is_empty() {
            "/".to_string()
        } else if tail.starts_with('/') {
            tail.split(['?', '#']).next().unwrap_or("/").to_string()
        } else {
            "/".to_string()
        };
        Some(UrlParts {
            host,
            path,
            secure: scheme.eq_ignore_ascii_case("https"),
        })
    }
}

fn random_uuid() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let h = hex(&bytes);
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

fn html_call(state: &Rc<RefCell<HostState>>, msg: &Value) -> Result<Value, String> {
    let function = msg.get("function").and_then(|v| v.as_str()).unwrap_or("");
    let doc_key = msg.get("key").and_then(|v| v.as_i64()).unwrap_or(-1);
    if function == "parse" {
        let data = msg.get("data").and_then(|v| v.as_str()).unwrap_or("");
        let html = Html::parse_document(data);
        let mut st = state.borrow_mut();
        if st.docs.len() >= 8 {
            if let Some(oldest) = st.docs.keys().min().copied() {
                st.docs.remove(&oldest);
            }
        }
        st.docs.insert(
            doc_key,
            HtmlDoc {
                html,
                elements: Vec::new(),
                nodes: Vec::new(),
            },
        );
        return Ok(Value::Null);
    }
    if function == "dispose" {
        state.borrow_mut().docs.remove(&doc_key);
        return Ok(Value::Null);
    }

    let element_key = msg.get("key").and_then(|v| v.as_i64()).unwrap_or(-1);
    let doc_id = msg.get("doc").and_then(|v| v.as_i64()).unwrap_or(doc_key);
    let mut st = state.borrow_mut();
    let doc = match st.docs.get_mut(&doc_id) {
        Some(d) => d,
        None => return Ok(Value::Null),
    };

    match function {
        "querySelector" => {
            let query = msg.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let selector = match Selector::parse(query) {
                Ok(s) => s,
                Err(_) => return Ok(Value::Null),
            };
            let found = doc.html.select(&selector).next().map(|e| e.id());
            Ok(found
                .map(|id| json!(add_element(doc, id)))
                .unwrap_or(Value::Null))
        }
        "querySelectorAll" => {
            let query = msg.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let selector = match Selector::parse(query) {
                Ok(s) => s,
                Err(_) => return Ok(json!([])),
            };
            let ids: Vec<NodeId> = doc.html.select(&selector).map(|e| e.id()).collect();
            let keys: Vec<i64> = ids.into_iter().map(|id| add_element(doc, id)).collect();
            Ok(json!(keys))
        }
        "getElementById" => {
            let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let root = doc.html.root_element();
            let found = root
                .descendants()
                .filter_map(ElementRef::wrap)
                .find(|e| e.value().id() == Some(id))
                .map(|e| e.id());
            Ok(found
                .map(|n| json!(add_element(doc, n)))
                .unwrap_or(Value::Null))
        }
        "getText" => {
            let element = get_element(doc, element_key);
            Ok(element
                .map(|e| json!(e.text().collect::<String>()))
                .unwrap_or(Value::Null))
        }
        "getAttributes" => {
            let element = get_element(doc, element_key);
            match element {
                Some(e) => {
                    let mut map = serde_json::Map::new();
                    for (k, v) in e.value().attrs() {
                        map.insert(k.to_string(), json!(v));
                    }
                    Ok(Value::Object(map))
                }
                None => Ok(Value::Null),
            }
        }
        "getInnerHTML" => {
            let element = get_element(doc, element_key);
            Ok(element
                .map(|e| json!(e.inner_html()))
                .unwrap_or(Value::Null))
        }
        "getParent" => {
            let element = get_element(doc, element_key);
            Ok(element
                .and_then(|e| e.parent().map(|p| p.id()))
                .map(|id| json!(add_element(doc, id)))
                .unwrap_or(Value::Null))
        }
        "dom_querySelector" | "dom_querySelectorAll" => {
            let query = msg.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let selector = match Selector::parse(query) {
                Ok(s) => s,
                Err(_) => {
                    return Ok(if function == "dom_querySelector" {
                        Value::Null
                    } else {
                        json!([])
                    })
                }
            };
            let element = match get_element(doc, element_key) {
                Some(e) => e,
                None => return Ok(Value::Null),
            };
            if function == "dom_querySelector" {
                let found = element.select(&selector).next().map(|e| e.id());
                Ok(found
                    .map(|id| json!(add_element(doc, id)))
                    .unwrap_or(Value::Null))
            } else {
                let ids: Vec<NodeId> = element.select(&selector).map(|e| e.id()).collect();
                let keys: Vec<i64> = ids.into_iter().map(|id| add_element(doc, id)).collect();
                Ok(json!(keys))
            }
        }
        "getChildren" => {
            let element = match get_element(doc, element_key) {
                Some(e) => e,
                None => return Ok(json!([])),
            };
            let ids: Vec<NodeId> = element.children().map(|e| e.id()).collect();
            let keys: Vec<i64> = ids.into_iter().map(|id| add_element(doc, id)).collect();
            Ok(json!(keys))
        }
        "getNodes" => {
            let element = match get_element(doc, element_key) {
                Some(e) => e,
                None => return Ok(json!([])),
            };
            let ids: Vec<NodeId> = match doc.html.tree.get(element.id()) {
                Some(node) => node.children().map(|n| n.id()).collect(),
                None => Vec::new(),
            };
            let keys: Vec<i64> = ids.into_iter().map(|id| add_node(doc, id)).collect();
            Ok(json!(keys))
        }
        "node_text" => {
            let node = match get_node(doc, element_key) {
                Some(n) => n,
                None => return Ok(Value::Null),
            };
            let text = match node.value() {
                scraper::Node::Text(t) => t.text.to_string(),
                _ => ElementRef::wrap(node)
                    .map(|e| e.text().collect::<String>())
                    .unwrap_or_default(),
            };
            Ok(json!(text))
        }
        "node_type" => {
            let node = match get_node(doc, element_key) {
                Some(n) => n,
                None => return Ok(json!("unknown")),
            };
            let kind = match node.value() {
                scraper::Node::Element(_) => "element",
                scraper::Node::Text(_) => "text",
                scraper::Node::Comment(_) => "comment",
                scraper::Node::Document => "document",
                _ => "unknown",
            };
            Ok(json!(kind))
        }
        "node_toElement" => {
            let node = match get_node(doc, element_key) {
                Some(n) => n,
                None => return Ok(Value::Null),
            };
            if ElementRef::wrap(node).is_some() {
                Ok(json!(add_element(doc, node.id())))
            } else {
                Ok(Value::Null)
            }
        }
        "getClassNames" => {
            let element = get_element(doc, element_key);
            match element {
                Some(e) => Ok(json!(e.value().classes().collect::<Vec<_>>())),
                None => Ok(json!([])),
            }
        }
        "getId" => {
            let element = get_element(doc, element_key);
            Ok(element
                .and_then(|e| e.value().id().map(|s| json!(s)))
                .unwrap_or(Value::Null))
        }
        "getLocalName" => {
            let element = get_element(doc, element_key);
            Ok(element
                .map(|e| json!(e.value().name()))
                .unwrap_or(Value::Null))
        }
        "getPreviousSibling" => {
            let element = get_element(doc, element_key);
            Ok(element
                .and_then(|e| e.prev_sibling_element().map(|s| s.id()))
                .map(|id| json!(add_element(doc, id)))
                .unwrap_or(Value::Null))
        }
        "getNextSibling" => {
            let element = get_element(doc, element_key);
            Ok(element
                .and_then(|e| e.next_sibling_element().map(|s| s.id()))
                .map(|id| json!(add_element(doc, id)))
                .unwrap_or(Value::Null))
        }
        _ => Ok(Value::Null),
    }
}

fn add_element(doc: &mut HtmlDoc, id: NodeId) -> i64 {
    doc.elements.push(id);
    (doc.elements.len() - 1) as i64
}

fn add_node(doc: &mut HtmlDoc, id: NodeId) -> i64 {
    doc.nodes.push(id);
    (doc.nodes.len() - 1) as i64
}

fn get_element(doc: &HtmlDoc, key: i64) -> Option<ElementRef<'_>> {
    if key < 0 {
        return None;
    }
    let id = *doc.elements.get(key as usize)?;
    ElementRef::wrap(doc.html.tree.get(id)?)
}

fn get_node(doc: &HtmlDoc, key: i64) -> Option<ego_tree::NodeRef<'_, scraper::Node>> {
    if key < 0 {
        return None;
    }
    let id = *doc.nodes.get(key as usize)?;
    doc.html.tree.get(id)
}

// ---------------------------------------------------------------------------
// Convert
// ---------------------------------------------------------------------------

fn bytes_from_value(value: &Value) -> Option<Vec<u8>> {
    match value {
        Value::String(s) => Some(s.as_bytes().to_vec()),
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(item.as_u64()? as u8);
            }
            Some(out)
        }
        Value::Object(obj) => {
            let bytes = obj.get("__bytes")?.as_array()?;
            let mut out = Vec::with_capacity(bytes.len());
            for item in bytes {
                out.push(item.as_u64()? as u8);
            }
            Some(out)
        }
        _ => None,
    }
}

fn string_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        other => bytes_from_value(other).map(|b| String::from_utf8_lossy(&b).to_string()),
    }
}

fn bytes_result(bytes: Vec<u8>) -> Value {
    json!({"__bytes": bytes})
}

fn convert(msg: &Value) -> Value {
    let kind = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let is_encode = msg
        .get("isEncode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let value = msg.get("value").cloned().unwrap_or(Value::Null);
    match kind {
        "utf8" => {
            if is_encode {
                match string_from_value(&value) {
                    Some(s) => bytes_result(s.into_bytes()),
                    None => Value::Null,
                }
            } else {
                match bytes_from_value(&value) {
                    Some(b) => json!(String::from_utf8_lossy(&b).to_string()),
                    None => Value::Null,
                }
            }
        }
        "gbk" => {
            if is_encode {
                match string_from_value(&value) {
                    Some(s) => {
                        let (encoded, _, _) = GBK.encode(&s);
                        bytes_result(encoded.to_vec())
                    }
                    None => Value::Null,
                }
            } else {
                match bytes_from_value(&value) {
                    Some(b) => {
                        let (decoded, _, _) = GBK.decode(&b);
                        json!(decoded.to_string())
                    }
                    None => Value::Null,
                }
            }
        }
        "base64" => {
            if is_encode {
                match bytes_from_value(&value) {
                    Some(b) => json!(B64.encode(b)),
                    None => Value::Null,
                }
            } else {
                match string_from_value(&value) {
                    Some(s) => match B64.decode(s.trim()) {
                        Ok(b) => bytes_result(b),
                        Err(_) => Value::Null,
                    },
                    None => Value::Null,
                }
            }
        }
        "md5" => hash_result(md5::Md5::digest(
            bytes_from_value(&value).unwrap_or_default(),
        )),
        "sha1" => hash_result(sha1::Sha1::digest(
            bytes_from_value(&value).unwrap_or_default(),
        )),
        "sha256" => hash_result(Sha256::digest(
            bytes_from_value(&value).unwrap_or_default(),
        )),
        "sha512" => hash_result(sha2::Sha512::digest(
            bytes_from_value(&value).unwrap_or_default(),
        )),
        "hmac" => {
            let key =
                bytes_from_value(msg.get("key").unwrap_or(&Value::Null)).unwrap_or_default();
            let data = bytes_from_value(&value).unwrap_or_default();
            let hash = msg.get("hash").and_then(|v| v.as_str()).unwrap_or("sha256");
            let is_string = msg
                .get("isString")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let digest = match hash {
                "md5" => hmac_md5(&key, &data),
                "sha1" => hmac_sha1(&key, &data),
                "sha256" => hmac_sha256(&key, &data),
                "sha512" => hmac_sha512(&key, &data),
                _ => None,
            };
            match digest {
                Some(bytes) => {
                    if is_string {
                        json!(hex(&bytes))
                    } else {
                        bytes_result(bytes)
                    }
                }
                None => Value::Null,
            }
        }
        "aes-ecb" | "aes-cbc" | "aes-cfb" | "aes-ofb" => {
            let key = bytes_from_value(msg.get("key").unwrap_or(&Value::Null))
                .unwrap_or_default();
            let iv = bytes_from_value(msg.get("iv").unwrap_or(&Value::Null))
                .unwrap_or_default();
            let block_size = msg
                .get("blockSize")
                .and_then(|v| v.as_u64())
                .unwrap_or(128) as usize;
            let data = bytes_from_value(&value).unwrap_or_default();
            match aes_process(kind, &key, &iv, &data, is_encode, block_size) {
                Some(result) => bytes_result(result),
                None => Value::Null,
            }
        }
        "rsa" => {
            if is_encode {
                return Value::Null;
            }
            let key = msg.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let data = bytes_from_value(&value).unwrap_or_default();
            match rsa_decrypt(key, &data) {
                Some(result) => bytes_result(result),
                None => Value::Null,
            }
        }
        _ => value,
    }
}

fn hash_result<D: AsRef<[u8]>>(digest: D) -> Value {
    bytes_result(digest.as_ref().to_vec())
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

fn hmac_md5(key: &[u8], data: &[u8]) -> Option<Vec<u8>> {
    let mut mac = <Hmac<md5::Md5> as Mac>::new_from_slice(key).ok()?;
    mac.update(data);
    Some(mac.finalize().into_bytes().to_vec())
}
fn hmac_sha1(key: &[u8], data: &[u8]) -> Option<Vec<u8>> {
    let mut mac = <Hmac<sha1::Sha1> as Mac>::new_from_slice(key).ok()?;
    mac.update(data);
    Some(mac.finalize().into_bytes().to_vec())
}
fn hmac_sha256(key: &[u8], data: &[u8]) -> Option<Vec<u8>> {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).ok()?;
    mac.update(data);
    Some(mac.finalize().into_bytes().to_vec())
}
fn hmac_sha512(key: &[u8], data: &[u8]) -> Option<Vec<u8>> {
    let mut mac = <Hmac<sha2::Sha512> as Mac>::new_from_slice(key).ok()?;
    mac.update(data);
    Some(mac.finalize().into_bytes().to_vec())
}

enum AesKind {
    A128(Aes128),
    A192(Aes192),
    A256(Aes256),
}

impl AesKind {
    fn new(key: &[u8]) -> Option<Self> {
        match key.len() {
            16 => Some(AesKind::A128(Aes128::new_from_slice(key).ok()?)),
            24 => Some(AesKind::A192(Aes192::new_from_slice(key).ok()?)),
            32 => Some(AesKind::A256(Aes256::new_from_slice(key).ok()?)),
            _ => None,
        }
    }

    fn encrypt(&self, block: &mut [u8; 16]) {
        let block = aes::cipher::generic_array::GenericArray::from_mut_slice(block);
        match self {
            AesKind::A128(c) => c.encrypt_block(block),
            AesKind::A192(c) => c.encrypt_block(block),
            AesKind::A256(c) => c.encrypt_block(block),
        }
    }

    fn decrypt(&self, block: &mut [u8; 16]) {
        let block = aes::cipher::generic_array::GenericArray::from_mut_slice(block);
        match self {
            AesKind::A128(c) => c.decrypt_block(block),
            AesKind::A192(c) => c.decrypt_block(block),
            AesKind::A256(c) => c.decrypt_block(block),
        }
    }
}

fn aes_process(
    kind: &str,
    key: &[u8],
    iv: &[u8],
    data: &[u8],
    encrypt: bool,
    block_size: usize,
) -> Option<Vec<u8>> {
    let cipher = AesKind::new(key)?;
    if data.len() % 16 != 0 && kind != "aes-cfb" && kind != "aes-ofb" {
        return None;
    }
    let mut out = Vec::with_capacity(data.len());
    match kind {
        "aes-ecb" => {
            for chunk in data.chunks(16) {
                if chunk.len() != 16 {
                    return None;
                }
                let mut block = [0u8; 16];
                block.copy_from_slice(chunk);
                if encrypt {
                    cipher.encrypt(&mut block);
                } else {
                    cipher.decrypt(&mut block);
                }
                out.extend_from_slice(&block);
            }
        }
        "aes-cbc" => {
            if iv.len() != 16 {
                return None;
            }
            let mut prev = [0u8; 16];
            prev.copy_from_slice(iv);
            for chunk in data.chunks(16) {
                if chunk.len() != 16 {
                    return None;
                }
                let mut block = [0u8; 16];
                block.copy_from_slice(chunk);
                if encrypt {
                    for i in 0..16 {
                        block[i] ^= prev[i];
                    }
                    cipher.encrypt(&mut block);
                    prev = block;
                    out.extend_from_slice(&block);
                } else {
                    let cipher_block = block;
                    cipher.decrypt(&mut block);
                    for i in 0..16 {
                        block[i] ^= prev[i];
                    }
                    prev = cipher_block;
                    out.extend_from_slice(&block);
                }
            }
        }
        "aes-cfb" => {
            if iv.len() != 16 {
                return None;
            }
            if block_size == 8 {
                let mut reg = [0u8; 16];
                reg.copy_from_slice(iv);
                for &byte in data {
                    let mut keystream = reg;
                    cipher.encrypt(&mut keystream);
                    let gamma = keystream[0];
                    let result = byte ^ gamma;
                    out.push(result);
                    reg.rotate_left(1);
                    reg[15] = if encrypt { result } else { byte };
                }
            } else {
                let mut prev = [0u8; 16];
                prev.copy_from_slice(iv);
                for chunk in data.chunks(16) {
                    let mut keystream = prev;
                    cipher.encrypt(&mut keystream);
                    let mut result = [0u8; 16];
                    for i in 0..chunk.len() {
                        result[i] = chunk[i] ^ keystream[i];
                    }
                    if encrypt {
                        prev = result;
                    } else {
                        prev = [0u8; 16];
                        prev[..chunk.len()].copy_from_slice(chunk);
                    }
                    out.extend_from_slice(&result[..chunk.len()]);
                }
            }
        }
        "aes-ofb" => {
            if iv.len() != 16 {
                return None;
            }
            let mut reg = [0u8; 16];
            reg.copy_from_slice(iv);
            for chunk in data.chunks(16) {
                cipher.encrypt(&mut reg);
                for (i, &byte) in chunk.iter().enumerate() {
                    out.push(byte ^ reg[i]);
                }
            }
        }
        _ => return None,
    }
    Some(out)
}

fn rsa_decrypt(key_b64: &str, data: &[u8]) -> Option<Vec<u8>> {
    let der = B64.decode(key_b64.trim()).ok()?;
    let key = RsaPrivateKey::from_pkcs8_der(&der).ok()?;
    use rsa::traits::PublicKeyParts;
    let size = key.size();
    let mut out = Vec::new();
    for chunk in data.chunks(size) {
        let decrypted = key.decrypt(Pkcs1v15Encrypt, chunk).ok()?;
        out.extend_from_slice(&decrypted);
    }
    Some(out)
}
