/// Compatibility patches applied to third-party source scripts at runtime.
///
/// Sources are shipped by `venera-configs` and occasionally hardcode domains
/// that later start returning an anti-bot challenge. Patching at execution
/// time keeps existing installs working without rewriting the user's stored
/// script, and upstream updates remain unaffected (each replacement is a
/// no-op once the source already uses the corrected form).
class SourcePatches {
  const SourcePatches._();

  /// Returns the script that should actually be executed for [key].
  static String script(String key, String script) {
    if (key != 'baozi') return script;
    var patched = script;
    // `baozi` reads chapter pages from appcn.baozimh.com, which is now
    // behind a Cloudflare challenge. The main site serves the identical
    // `.comic-contain > .chapter-img` markup at /comic/chapter/... .
    patched = patched.replaceAll(
      'https://appcn.baozimh.com/baozimhapp',
      r'${this.baseUrl}',
    );
    // The main-site reader page puts `.comic-contain__item` directly under
    // `.comic-contain` (with a wrapper div), while the app page wrapped it in
    // `.chapter-img`; the descendant selector matches both.
    patched = patched.replaceAll(
      'doc.querySelectorAll(".comic-contain > .chapter-img");',
      'doc.querySelectorAll(".comic-contain .comic-contain__item");',
    );
    if (!patched.contains('imgNode.attributes?.["data-src"] ||')) {
      patched = patched.replaceAll(
        'let imgUrl = imgNode.querySelector(".comic-contain__item")?.attributes?.["data-src"];',
        'let imgUrl = imgNode.attributes?.["data-src"] || imgNode.querySelector(".comic-contain__item")?.attributes?.["data-src"];',
      );
    }
    // The source ignores the signin API's `result` flag, so wrong credentials
    // silently produce an empty TSID cookie and look like a successful login.
    if (!patched.contains('if (!json.result)')) {
      patched = patched.replaceAll(
        'let token = json.data;',
        'if (!json.result) { throw "用户名或密码错误"; }\n      let token = json.data;',
      );
    }
    return patched;
  }

  /// Settings descriptors passed to the JS runtime and shown by the UI.
  /// `baozi`'s default main domain is currently blocked by an anti-bot
  /// challenge; use a reachable mirror as the default instead.
  static Map<String, Object?> settings(
    String key,
    Map<String, Object?> settings,
  ) {
    if (key != 'baozi') return settings;
    final domains = settings['domains'];
    if (domains is! Map) return settings;
    final current = domains['default'];
    if (current != 'bzmgcn.com' && current != 'baozimhcn.com') {
      return settings;
    }
    return {
      ...settings,
      'domains': {
        ...domains,
        'default': 'webmota.com',
      },
    };
  }
}
