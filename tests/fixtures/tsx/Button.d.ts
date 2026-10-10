import type { ReactElement } from 'react'

export interface ButtonProps {
  /** ボタンの見た目 */
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  label: string
  onClick?: () => void
}

export declare function Button(props: ButtonProps): ReactElement
