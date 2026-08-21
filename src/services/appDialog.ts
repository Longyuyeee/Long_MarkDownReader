import type { DialogApi } from 'naive-ui'

export interface AppConfirmOptions {
  title: string
  content: string
  positiveText?: string
  negativeText?: string
  danger?: boolean
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
