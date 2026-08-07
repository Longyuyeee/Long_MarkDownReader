import { invoke } from '@tauri-apps/api/core'
import { PDFDataRangeTransport } from 'pdfjs-dist'

export interface PdfReadDescriptor {
  length: number
  signature: string
  initialData: number[]
  fullData?: number[] | null
  rangeChunkSize: number
}

interface RangeTransportOptions {
  libraryRoot?: string
  external?: boolean
  path: string
  signature: string
  fileName: string
  onError: (error: string) => void
}

export class TauriPdfRangeTransport extends PDFDataRangeTransport {
  private active = true

  constructor(length: number, initialData: Uint8Array, private readonly options: RangeTransportOptions) {
    super(length, initialData, true, options.fileName)
  }

  requestDataRange(begin: number, end: number): void {
    if (!this.active) return
    void invoke<number[]>(this.options.external ? 'read_external_pdf_range' : 'read_pdf_range', {
      ...(this.options.external ? {} : { libraryRoot: this.options.libraryRoot }),
      path: this.options.path,
      begin,
      end,
      expectedSignature: this.options.signature,
    }).then(data => {
      if (!this.active) return
      const bytes = new Uint8Array(data)
      if (bytes.byteLength !== end - begin) throw new Error('PDF 范围响应长度不完整')
      this.onDataRange(begin, bytes)
    }).catch(cause => {
      if (!this.active) return
      this.active = false
      this.options.onError(String(cause).replace(/^Error:\s*/, ''))
    })
  }

  abort(): void {
    this.active = false
  }
}
