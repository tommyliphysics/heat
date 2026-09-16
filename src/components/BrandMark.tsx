type BrandMarkProps = {
  size?: number
  className?: string
}

/**
 * The Heat wordmark's icon: a flame and a chili pepper drawn as one leaning
 * shape (the pepper's curl doubles as the flame's tapering tip), with a
 * small calyx at its base and one droplet breaking off — read as either a
 * spark or a bead of sweat. Colors are fixed brand values, not theme
 * tokens — a logo doesn't recolor for dark mode, same as `Icon.tsx`'s
 * glyphs use `currentColor` deliberately while this deliberately doesn't.
 */
function BrandMark({ size = 24, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * 130) / 100}
      viewBox="0 0 200 260"
      style={{ transform: 'rotate(-6deg)' }}
      aria-hidden="true"
    >
      <path
        fill="#FF4425"
        d="M100 250 C40 220 30 150 55 110 C75 80 60 50 78 15 C95 25 100 45 85 60 C130 80 150 110 140 150 C132 190 118 225 100 250 Z"
      />
      <path
        fill="#FFB130"
        d="M101 219 C74 199 69 162 83 137 C92 122 87 101 96 86 C101 97 105 111 100 130 C114 149 119 179 105 204 C104 210 102 215 101 219 Z"
      />
      <path fill="#7A1E1B" d="M85 248 C75 255 60 255 52 248 C60 242 78 240 85 248 Z" />
      <path fill="#7A1E1B" d="M112 248 C122 256 138 255 145 246 C136 240 118 240 112 248 Z" />
      <path fill="#52CFE6" d="M137 29 C148 39 148 54 137 58 C126 54 126 39 137 29 Z" />
    </svg>
  )
}

export default BrandMark
