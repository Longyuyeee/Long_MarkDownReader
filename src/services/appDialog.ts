import { NInput, type DialogApi } from 'naive-ui'
import { h, ref, type CSSProperties } from 'vue'

export interface AppConfirmOptions {
  title: string
  content: string
  positiveText?: string
  negativeText?: string
  danger?: boolean
}

export interface AppPromptOptions {
  title: string
  content?: string
  initialValue?: string
  placeholder?: string
  positiveText?: string
  multiline?: boolean
  password?: boolean
}

const promptDescriptionStyle: CSSProperties = {
  margin: '0 0 10px',
  color: 'var(--theme-text-secondary)',
  fontSize: '12px',
  lineHeight: '1.55',
  whiteSpace: 'pre-wrap',
}

export const confirmAppAction = (dialog: DialogApi, options: AppConfirmOptions) => new Promise<boolean>(resolve => {
  let settled = false
  const settle = (value: boolean) => {
    if (settled) return
    settled = true
    resolve(value)
  }

  dialog.warning({
    title: options.title,
    content: options.content,
    positiveText: options.positiveText || '继续',
    negativeText: options.negativeText || '取消',
    positiveButtonProps: options.danger ? { type: 'error' } : { type: 'primary' },
    negativeButtonProps: { secondary: true },
    onPositiveClick: () => settle(true),
    onNegativeClick: () => settle(false),
    onClose: () => settle(false),
    onEsc: () => settle(false),
    onMaskClick: () => settle(false),
  })
})

export const promptAppAction = (dialog: DialogApi, options: AppPromptOptions) => new Promise<string | null>(resolve => {
  const value = ref(options.initialValue || '')
  let settled = false
  const settle = (result: string | null) => {
    if (settled) return
    settled = true
    resolve(result)
  }

  dialog.create({
    title: options.title,
    content: () => h('div', { class: 'app-prompt-content' }, [
      options.content ? h('p', { style: promptDescriptionStyle }, options.content) : null,
      h(NInput, {
        value: value.value,
        type: options.multiline ? 'textarea' : options.password ? 'password' : 'text',
        placeholder: options.placeholder,
        autofocus: true,
        autosize: options.multiline ? { minRows: 3, maxRows: 8 } : undefined,
        showPasswordOn: options.password ? 'click' : undefined,
        'onUpdate:value': (next: string) => { value.value = next },
      }),
    ]),
    positiveText: options.positiveText || '确定',
    negativeText: '取消',
    positiveButtonProps: { type: 'primary' },
    negativeButtonProps: { secondary: true },
    onPositiveClick: () => settle(value.value),
    onNegativeClick: () => settle(null),
    onClose: () => settle(null),
    onEsc: () => settle(null),
    onMaskClick: () => settle(null),
  })
})
