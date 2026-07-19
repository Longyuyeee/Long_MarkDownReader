import type { Worker } from 'tesseract.js'

export interface OcrProgress {
  status: string
  progress: number
}

const assetUrl = (path: string) => new URL(path, window.location.href).href

export const createOfflineOcrWorker = async (onProgress: (progress: OcrProgress) => void): Promise<Worker> => {
  const { createWorker, OEM } = await import('tesseract.js')
  return createWorker('chi_sim+eng', OEM.LSTM_ONLY, {
    workerPath: assetUrl('./ocr/worker.min.js'),
    corePath: assetUrl('./ocr/core'),
    langPath: assetUrl('./ocr/lang'),
    logger: message => onProgress({ status: message.status, progress: message.progress || 0 }),
  })
}
