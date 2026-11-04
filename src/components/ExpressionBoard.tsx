import { Icon } from './Icon'

export type Phrase = {
  id: string
  text: string
  hint: string
  emoji: string
  tone: string
}

const PHRASES: Phrase[] = [
  { id: 'help', text: '我需要帮助', hint: '请求协助', emoji: '✺', tone: 'coral' },
  { id: 'water', text: '请帮我拿水', hint: '日常需求', emoji: '◌', tone: 'mint' },
  { id: 'rest', text: '我想休息一下', hint: '身体感受', emoji: '☾', tone: 'violet' },
  { id: 'repeat', text: '请再说一遍', hint: '沟通交流', emoji: '↻', tone: 'amber' },
  { id: 'closer', text: '请靠近一点', hint: '沟通交流', emoji: '⌁', tone: 'mint' },
  { id: 'thanks', text: '谢谢你', hint: '表达感谢', emoji: '✦', tone: 'amber' },
  { id: 'draw', text: '我想画画', hint: '进入创作', emoji: '⌁', tone: 'violet' },
  { id: 'home', text: '我想回家', hint: '表达意愿', emoji: '⌂', tone: 'coral' },
  { id: 'doctor', text: '我需要医生', hint: '紧急需求', emoji: '+', tone: 'coral' },
]

export function ExpressionBoard({
  selected,
  history,
  onSpeak,
}: {
  selected: Phrase | null
  history: Phrase[]
  onSpeak: (phrase: Phrase) => void
}) {
  return (
    <section className="expression-board">
      <div className="section-heading">
        <div>
          <span className="eyebrow">EXPRESSION BOARD</span>
          <h2>让目光替你说</h2>
        </div>
        <span className="section-note">注视停留 0.8 秒即可选择</span>
      </div>

      <div className={`now-saying ${selected ? 'has-selection' : ''}`}>
        <div className="now-saying__icon">
          <Icon name="speaker" size={22} />
        </div>
        <div>
          <span className="eyebrow">NOW SAYING</span>
          <strong>{selected?.text ?? '等待一个目光…'}</strong>
        </div>
        <span className="now-saying__hint">
          {selected ? '已通过浏览器语音朗读' : '选择一张卡片开始'}
        </span>
      </div>

      <div className="phrase-grid">
        {PHRASES.map((phrase) => (
          <button
            className={`phrase-card tone-${phrase.tone}`}
            key={phrase.id}
            data-gaze-target
            onClick={() => onSpeak(phrase)}
            aria-label={`${phrase.text}，${phrase.hint}`}
          >
            <span className="phrase-card__emoji">{phrase.emoji}</span>
            <span className="phrase-card__text">{phrase.text}</span>
            <span className="phrase-card__hint">{phrase.hint}</span>
            <span className="phrase-card__arrow">
              <Icon name="arrow" size={15} />
            </span>
          </button>
        ))}
      </div>

      <div className="history-row">
        <span className="eyebrow">RECENT</span>
        {history.length === 0 ? (
          <span className="history-empty">还没有表达记录</span>
        ) : (
          history.slice(0, 4).map((phrase, index) => (
            <span className="history-chip" key={`${phrase.id}-${index}`}>
              {phrase.text}
            </span>
          ))
        )}
      </div>
    </section>
  )
}
