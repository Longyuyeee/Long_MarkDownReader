import type { App } from 'vue'
import {
  NButton, NButtonGroup, NCheckbox, NColorPicker, NConfigProvider,
  NDialogProvider, NDropdown, NEmpty, NForm, NFormItem, NGrid,
  NGridItem, NIcon, NInput, NInputGroup, NInputNumber, NMessageProvider,
  NModal, NRadioButton, NRadioGroup, NSelect, NSpin, NSwitch, NTag, NTree,
} from 'naive-ui'

// The application and browser fixtures must use the same registration boundary.
// Components outside this list must be imported by their consuming component.
export const naiveComponents = {
  NButton, NButtonGroup, NCheckbox, NColorPicker, NConfigProvider,
  NDialogProvider, NDropdown, NEmpty, NForm, NFormItem, NGrid,
  NGridItem, NIcon, NInput, NInputGroup, NInputNumber, NMessageProvider,
  NModal, NRadioButton, NRadioGroup, NSelect, NSpin, NSwitch, NTag, NTree,
}

export function registerNaiveComponents(app: App) {
  for (const [name, component] of Object.entries(naiveComponents)) app.component(name, component)
}
