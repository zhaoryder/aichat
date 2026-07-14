import { useState, useEffect, useRef, useCallback } from 'react'

// Web Speech API 类型声明（重命名以避免与 DOM lib 自带的 SpeechRecognition 类型冲突）
interface MySpeechRecognitionEvent extends Event {
  results: MySpeechRecognitionResultList
  resultIndex: number
}

interface MySpeechRecognitionResultList {
  length: number
  item(index: number): MySpeechRecognitionResult
  [index: number]: MySpeechRecognitionResult
}

interface MySpeechRecognitionResult {
  length: number
  item(index: number): MySpeechRecognitionAlternative
  [index: number]: MySpeechRecognitionAlternative
  isFinal: boolean
}

interface MySpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface MySpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface MySpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: MySpeechRecognitionEvent) => void) | null
  onerror: ((event: MySpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export function useSpeechRecognition(lang = 'zh-CN') {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recognitionRef = useRef<MySpeechRecognition | null>(null)

  useEffect(() => {
    // 使用 as any 绕过 DOM lib 类型（window.SpeechRecognition 已在 DOM lib 中声明）
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognitionClass) {
      setIsSupported(true)
      const recognition = new SpeechRecognitionClass() as MySpeechRecognition
      recognition.lang = lang
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onresult = (event: MySpeechRecognitionEvent) => {
        let final = ''
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            final += result[0].transcript
          } else {
            interim += result[0].transcript
          }
        }
        if (final) {
          setTranscript(prev => prev + final)
        }
        setInterimTranscript(interim)
      }

      recognition.onerror = (event: MySpeechRecognitionErrorEvent) => {
        // no-speech / aborted 视为正常结束，不报错
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return
        }
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
        setInterimTranscript('')
      }

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognitionRef.current = recognition
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [lang])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return
    setTranscript('')
    setInterimTranscript('')
    try {
      recognitionRef.current.start()
    } catch (err) {
      console.error('Failed to start recognition:', err)
    }
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
  }, [])

  // 确保麦克风释放：abort 识别并置空 ref
  const cleanup = useCallback(() => {
    const recognition = recognitionRef.current
    if (recognition) {
      try {
        recognition.abort()
      } catch {
        // 忽略 abort 异常
      }
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    cleanup,
  }
}
