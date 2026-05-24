import { CheckCircle2 } from 'lucide-react'

export default function Toast({ message }) {
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={16} />
      {message}
    </div>
  )
}
