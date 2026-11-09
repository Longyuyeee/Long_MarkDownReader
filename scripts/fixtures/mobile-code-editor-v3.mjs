export const codeEditorV3Name='notes-v3.py'
export const codeEditorV3Source='\uFEFF'+[
 'def count_words(text: str) -> dict:',
 '    """统计文本中各单词的出现次数。"""',
 '    words = text.lower().split()',
 '    result = {}',
 '    for w in words:',
 '        result[w] = result.get(w, 0) + 1',
 '',
 '    return result',
 '',
 "if __name__ == '__main__':",
 "    print(count_words('hello world'))"
].join('\r\n')
