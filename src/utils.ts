import fs from 'node:fs'
import path from 'node:path'
import shell from 'shelljs'
import type { Logger } from './types'

export const checkIfFileExists = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[nwhisper] Error: No such file: ${filePath}`)
  }
}

async function isValidWavHeader(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const readable = fs.createReadStream(filePath, { end: 43 })
    let data = Buffer.alloc(0)

    readable.on('data', (chunk: string | Buffer) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      data = Buffer.concat([data, bufferChunk])
    })

    readable.on('end', () => {
      const isWav =
        data.toString('binary', 0, 4) === 'RIFF' || data.toString('binary', 0, 4) === 'RIFX'

      if (!isWav) {
        resolve(false)
        return
      }

      if (data.length >= 28) {
        const sampleRate = data.readUInt32LE(24)

        resolve(sampleRate === 16000)
      } else {
        resolve(false)
      }
    })

    readable.on('error', err => reject(err))
  })
}

export const convertToWavType = async (inputFilePath: string, logger: Logger = console) => {
  const fileExtension = path.extname(inputFilePath).toLowerCase()

  logger.debug(`[nwhisper] Checking if the file is a valid WAV: ${inputFilePath}`)

  if (fileExtension === '.wav') {
    const isWav = await isValidWavHeader(inputFilePath)
    if (isWav) {
      logger.debug(`[nwhisper] File is a valid WAV file.`)

      return inputFilePath
    } else {
      logger.debug(`[nwhisper] File has a .wav extension but is not a valid WAV, overwriting...`)

      // Use a temporary file to avoid overwrite conflicts
      const tempFile = `${inputFilePath}.temp.wav`
      const command = `ffmpeg -nostats -loglevel error -y -i "${inputFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempFile}"`
      const result = shell.exec(command)
      if (result.code !== 0) {
        throw new Error(`[nwhisper] Failed to convert audio file: ${result.stderr}`)
      }

      fs.renameSync(tempFile, inputFilePath)
      return inputFilePath
    }
  } else {
    // Convert to a new WAV file
    const outputFilePath = path.join(
      path.dirname(inputFilePath),
      `${path.basename(inputFilePath, fileExtension)}.wav`
    )

    logger.debug(`[nwhisper] Converting to a new WAV file: ${outputFilePath}`)

    const command = `ffmpeg -nostats -loglevel error -y -i "${inputFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputFilePath}"`
    const result = shell.exec(command)
    if (result.code !== 0) {
      throw new Error(`[nwhisper] Failed to convert audio file: ${result.stderr}`)
    }
    return outputFilePath
  }
}
