import { Button } from '../Button/Button'
import './Tabs.css'

interface TabsProps<Value extends string> {
  tabs: readonly { value: Value; label: string }[]
  value: Value
  onChange: (value: Value) => void
}

export function Tabs<Value extends string>({ tabs, value, onChange }: TabsProps<Value>) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <Button
          variant="plain"
          key={tab.value}
          className={`tabs__button${tab.value === value ? ' tabs__button--active' : ''}`}
          type="button"
          onClick={() => {
            onChange(tab.value)
          }}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  )
}
