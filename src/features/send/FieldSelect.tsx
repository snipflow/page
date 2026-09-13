import { Select } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'

export interface FieldSelectOption<Value extends string> {
  description?: string
  label: string
  value: Value
}

interface FieldSelectProps<Value extends string> {
  ariaLabel: string
  disabled?: boolean
  id: string
  onChange: (value: Value) => void
  options: readonly FieldSelectOption<Value>[]
  value: Value
}

export function FieldSelect<Value extends string>({
  ariaLabel,
  disabled = false,
  id,
  onChange,
  options,
  value,
}: FieldSelectProps<Value>) {
  return (
    <Select.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onChange(nextValue)
      }}
    >
      <Select.Trigger
        id={id}
        className="select-control select-control--trigger"
        aria-label={ariaLabel}
      >
        <Select.Value className="select-control__value" />
        <Select.Icon className="select-control__icon">
          <ChevronDown aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className="select-menu__positioner"
          alignItemWithTrigger={false}
          sideOffset={6}
        >
          <Select.Popup className="select-menu__popup">
            <Select.List className="select-menu__list">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className={`select-menu__item${option.description ? 'select-menu__item--with-meta' : ''}`}
                >
                  <span className="select-menu__indicator-slot">
                    <Select.ItemIndicator className="select-menu__indicator">
                      <Check aria-hidden="true" />
                    </Select.ItemIndicator>
                  </span>
                  <Select.ItemText className="select-menu__label">
                    {option.label}
                  </Select.ItemText>
                  {option.description ? (
                    <small className="select-menu__meta">
                      {option.description}
                    </small>
                  ) : null}
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
