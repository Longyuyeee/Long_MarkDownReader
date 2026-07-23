export const MAX_CONDITIONAL_EXPRESSION_LENGTH = 512
export const MAX_CONDITIONAL_EXPRESSION_DEPTH = 8
export const MAX_CONDITIONAL_EXPRESSION_ARGUMENTS = 8
export const MAX_CONDITIONAL_EXPRESSION_REFERENCES = 8

export interface ConditionalCellReference {
  column: number
  row: number
  absoluteColumn: boolean
  absoluteRow: boolean
}

type ConditionalLiteral = number | string | boolean
type ConditionalOperand = { kind: 'reference'; reference: ConditionalCellReference } | { kind: 'literal'; value: ConditionalLiteral }
type CompareOperator = '=' | '<>' | '<' | '<=' | '>' | '>='
export type ConditionalExpression =
  | { kind: 'comparison'; operator: CompareOperator; left: ConditionalOperand; right: ConditionalOperand }
  | { kind: 'and'; expressions: ConditionalExpression[] }
  | { kind: 'or'; expressions: ConditionalExpression[] }
  | { kind: 'not'; expression: ConditionalExpression }

type Token =
  | { kind: 'operand'; operand: ConditionalOperand }
  | { kind: 'function'; name: 'and' | 'or' | 'not' }
  | { kind: 'compare'; operator: CompareOperator }
  | { kind: 'left' | 'right' | 'comma' }

const columnIndex = (source: string) => {
  let result = 0
  for (const character of source.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64
  return result - 1
}

const tokenize = (formula: string): Token[] | null => {
  const source = formula.trim().replace(/^=/, '').trim()
  if (!source || source.length > MAX_CONDITIONAL_EXPRESSION_LENGTH) return null
  const tokens: Token[] = []
  let referenceCount = 0
  let index = 0
  while (index < source.length) {
    const character = source[index]
    if (/\s/.test(character)) { index += 1; continue }
    if (character === '(') { tokens.push({ kind: 'left' }); index += 1; continue }
    if (character === ')') { tokens.push({ kind: 'right' }); index += 1; continue }
    if (character === ',') { tokens.push({ kind: 'comma' }); index += 1; continue }
    const comparison = source.slice(index).match(/^(<=|>=|<>|=|<|>)/)?.[1] as CompareOperator | undefined
    if (comparison) { tokens.push({ kind: 'compare', operator: comparison }); index += comparison.length; continue }
    if (character === '"') {
      let value = ''
      index += 1
      let closed = false
      while (index < source.length) {
        if (source[index] !== '"') { value += source[index]; index += 1; continue }
        if (source[index + 1] === '"') { value += '"'; index += 2; continue }
        index += 1; closed = true; break
      }
      if (!closed) return null
      tokens.push({ kind: 'operand', operand: { kind: 'literal', value } })
      continue
    }
    const number = source.slice(index).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/)?.[0]
    if (number) {
      const value = Number(number)
      if (!Number.isFinite(value)) return null
      tokens.push({ kind: 'operand', operand: { kind: 'literal', value } })
      index += number.length
      continue
    }
    const reference = source.slice(index).match(/^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,6})/)
    if (reference) {
      const column = columnIndex(reference[2]); const row = Number(reference[4]) - 1
      if (column < 0 || column >= 16_384 || row < 0 || row >= 1_048_576) return null
      referenceCount += 1
      if (referenceCount > MAX_CONDITIONAL_EXPRESSION_REFERENCES) return null
      tokens.push({ kind: 'operand', operand: { kind: 'reference', reference: { column, row, absoluteColumn: reference[1] === '$', absoluteRow: reference[3] === '$' } } })
      index += reference[0].length
      continue
    }
    const word = source.slice(index).match(/^[A-Za-z]+/)?.[0]
    if (!word) return null
    const lower = word.toLowerCase()
    if (lower === 'true' || lower === 'false') tokens.push({ kind: 'operand', operand: { kind: 'literal', value: lower === 'true' } })
    else if (lower === 'and' || lower === 'or' || lower === 'not') tokens.push({ kind: 'function', name: lower })
    else return null
    index += word.length
  }
  return referenceCount ? tokens : null
}

export const parseConditionalExpression = (formula: string): ConditionalExpression | null => {
  const tokens = tokenize(formula)
  if (!tokens) return null
  let position = 0
  const take = (kind: Token['kind']) => tokens[position]?.kind === kind ? tokens[position++] : undefined
  const parseOperand = () => {
    const token = take('operand')
    return token?.kind === 'operand' ? token.operand : null
  }
  const parseExpression = (depth: number): ConditionalExpression | null => {
    if (depth > MAX_CONDITIONAL_EXPRESSION_DEPTH) return null
    const token = tokens[position]
    if (token?.kind === 'function') {
      position += 1
      if (!take('left')) return null
      if (token.name === 'not') {
        const expression = parseExpression(depth + 1)
        return expression && take('right') ? { kind: 'not', expression } : null
      }
      const expressions: ConditionalExpression[] = []
      while (expressions.length < MAX_CONDITIONAL_EXPRESSION_ARGUMENTS) {
        const expression = parseExpression(depth + 1)
        if (!expression) return null
        expressions.push(expression)
        if (take('comma')) continue
        if (!take('right') || expressions.length < 2) return null
        return { kind: token.name, expressions }
      }
      return null
    }
    const left = parseOperand()
    const comparison = take('compare')
    const right = parseOperand()
    if (!left || comparison?.kind !== 'compare' || !right) return null
    if (!['=', '<>'].includes(comparison.operator) && [left, right].some(operand => operand.kind === 'literal' && typeof operand.value !== 'number')) return null
    return { kind: 'comparison', operator: comparison.operator, left, right }
  }
  const result = parseExpression(0)
  return result && position === tokens.length ? result : null
}

export const conditionalExpressionReferences = (expression: ConditionalExpression): ConditionalCellReference[] => {
  if (expression.kind === 'comparison') return [expression.left, expression.right]
    .filter((operand): operand is Extract<ConditionalOperand, { kind: 'reference' }> => operand.kind === 'reference')
    .map(operand => operand.reference)
  if (expression.kind === 'not') return conditionalExpressionReferences(expression.expression)
  return expression.expressions.flatMap(conditionalExpressionReferences)
}

interface ConditionalExpressionContext {
  row: number
  column: number
  anchorRow: number
  anchorColumn: number
  rowCount: number
  columnCount: number
  valueAt: (row: number, column: number) => string | undefined
}

const resolvedReference = (reference: ConditionalCellReference, context: ConditionalExpressionContext) => ({
  row: reference.absoluteRow ? reference.row : reference.row + context.row - context.anchorRow,
  column: reference.absoluteColumn ? reference.column : reference.column + context.column - context.anchorColumn,
})

interface ResolvedOperand { value: ConditionalLiteral; kind: 'reference' | 'number' | 'text' | 'boolean' }

const operandValue = (operand: ConditionalOperand, context: ConditionalExpressionContext): ResolvedOperand | undefined => {
  if (operand.kind === 'literal') {
    const kind: ResolvedOperand['kind'] = typeof operand.value === 'string' ? 'text' : typeof operand.value === 'number' ? 'number' : 'boolean'
    return { value: operand.value, kind }
  }
  const coordinate = resolvedReference(operand.reference, context)
  if (coordinate.row < 0 || coordinate.column < 0 || coordinate.row >= context.rowCount || coordinate.column >= context.columnCount) return undefined
  const value = context.valueAt(coordinate.row, coordinate.column)
  return value === undefined ? undefined : { value, kind: 'reference' }
}

const comparablePair = (left: ResolvedOperand, right: ResolvedOperand): [number | string | boolean, number | string | boolean] => {
  const leftText = String(left.value).trim(); const rightText = String(right.value).trim()
  if (left.kind === 'text' || right.kind === 'text') return [leftText.toLocaleLowerCase(), rightText.toLocaleLowerCase()]
  if (left.kind === 'boolean' || right.kind === 'boolean' || (/^(true|false)$/i.test(leftText) && /^(true|false)$/i.test(rightText))) {
    if (/^(true|false)$/i.test(leftText) && /^(true|false)$/i.test(rightText)) return [leftText.toLowerCase() === 'true', rightText.toLowerCase() === 'true']
    return [leftText.toLocaleLowerCase(), rightText.toLocaleLowerCase()]
  }
  if ((left.kind === 'number' || right.kind === 'number' || left.kind === 'reference' && right.kind === 'reference') && leftText && rightText && Number.isFinite(Number(leftText)) && Number.isFinite(Number(rightText))) return [Number(leftText), Number(rightText)]
  return [leftText.toLocaleLowerCase(), rightText.toLocaleLowerCase()]
}

export const evaluateConditionalExpression = (expression: ConditionalExpression, context: ConditionalExpressionContext): boolean => {
  if (expression.kind === 'and') return expression.expressions.every(item => evaluateConditionalExpression(item, context))
  if (expression.kind === 'or') return expression.expressions.some(item => evaluateConditionalExpression(item, context))
  if (expression.kind === 'not') return !evaluateConditionalExpression(expression.expression, context)
  const leftValue = operandValue(expression.left, context); const rightValue = operandValue(expression.right, context)
  if (leftValue === undefined || rightValue === undefined) return false
  const [left, right] = comparablePair(leftValue, rightValue)
  if (expression.operator === '=') return left === right
  if (expression.operator === '<>') return left !== right
  if (typeof left !== 'number' || typeof right !== 'number') return false
  if (expression.operator === '<') return left < right
  if (expression.operator === '<=') return left <= right
  if (expression.operator === '>') return left > right
  return left >= right
}
