import { useParams } from 'react-router-dom'

export function ThreadPage(): React.JSX.Element {
  const params = useParams()

  return (
    <section>
      <h1>Thread</h1>
      <p>assistantId: {params.assistantId ?? '(none)'}</p>
      <p>threadId: {params.threadId ?? '(new thread)'}</p>
    </section>
  )
}
