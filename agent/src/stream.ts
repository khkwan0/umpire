export async function* readSseLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = body.getReader()
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        yield line
      }
    }
    if (buffer) yield buffer
  } finally {
    reader.releaseLock()
  }
}

export function parseSseDataLine(line: string): string | null {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trimStart()
  if (!data || data === '[DONE]') return null
  return data
}
