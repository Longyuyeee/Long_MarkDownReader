export async function withDeadline(work, milliseconds, description) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${milliseconds} ms: ${description}`)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
