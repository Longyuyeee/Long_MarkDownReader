import {outlineNavigationSources,outlineNavigationPrefix} from './structured-outline-navigation-fixture.mjs'
export const outlineContinuitySources={...outlineNavigationSources,
 json:'{"first":"原稿","second":"保留😀","third":"最后","group":{"nested":"内部"}}\n',
 toml:outlineNavigationSources.toml+'items = ["alpha", "保留😀"]\n',
}
export const outlineContinuityDraft=mode=>outlineNavigationPrefix(mode)+outlineContinuitySources[mode].replace('原稿','我的草稿')
