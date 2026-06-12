import { useEffect, useState } from 'react'

export function useImageSize(url: string): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    setSize(null)
    if (!url) return
    const img = new Image()
    img.onload = () => setSize({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = url
    return () => {
      img.onload = null
    }
  }, [url])
  return size
}
