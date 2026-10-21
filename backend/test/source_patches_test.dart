import 'package:test/test.dart';
import 'package:venera_server/services/source_patches.dart';

void main() {
  test('baozi script patch rewrites the chapter URL and parser', () {
    const original = '''
      let currentPageUrl = `https://appcn.baozimh.com/baozimhapp/comic/chapter/\${comicId}/0_\${epId}.html`;
      const imageNodes = doc.querySelectorAll(".comic-contain > .chapter-img");
      let imgUrl = imgNode.querySelector(".comic-contain__item")?.attributes?.["data-src"];
      let token = json.data;
    ''';
    final patched = SourcePatches.script('baozi', original);
    expect(patched, contains(r'${this.baseUrl}'));
    expect(patched, isNot(contains('appcn.baozimh.com')));
    expect(patched, contains('.comic-contain .comic-contain__item'));
    expect(patched, contains('imgNode.attributes?.["data-src"] ||'));
    expect(patched, contains('if (!json.result)'));
    // Runtime patches are applied on every call, so they must be idempotent.
    expect(SourcePatches.script('baozi', patched), patched);
  });

  test('baozi settings use a reachable mirror when the default is blocked', () {
    final source = {
      'domains': {
        'default': 'bzmgcn.com',
        'options': [
          {'value': 'bzmgcn.com'},
          {'value': 'webmota.com'},
        ],
      },
    };
    final patched = SourcePatches.settings('baozi', source);
    expect((patched['domains'] as Map)['default'], 'webmota.com');
    expect((source['domains'] as Map)['default'], 'bzmgcn.com',
        reason: 'the stored descriptor must not be mutated');

    final custom = {
      'domains': {'default': 'kukuc.co'},
    };
    expect(SourcePatches.settings('baozi', custom), same(custom));
    expect(SourcePatches.settings('other', source), same(source));
  });
}
