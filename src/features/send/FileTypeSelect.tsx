import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown } from 'lucide-react'
import {
  FILE_TYPE_DEFINITIONS,
  type FileTypeDefinition,
  type FileTypeGroup,
  type FileTypeId,
} from '../../domain/index.ts'

interface FileTypeOption extends FileTypeDefinition {
  value: FileTypeId
}

interface FileTypeOptionGroup {
  items: FileTypeOption[]
  value: string
}

const GROUP_LABELS: Record<FileTypeGroup, string> = {
  archive: '归档',
  code: '结构与源码',
  document: '文档',
  image: '图片',
  media: '音频与视频',
  other: '其他',
  text: '文本与标记',
}

const GROUP_ORDER: FileTypeGroup[] = [
  'text',
  'code',
  'image',
  'media',
  'document',
  'archive',
  'other',
]

const OPTIONS = FILE_TYPE_DEFINITIONS.filter(
  (definition) => definition.id !== 'unknown',
).map((definition) => ({ ...definition, value: definition.id }))

const GROUPS: FileTypeOptionGroup[] = GROUP_ORDER.map((group) => ({
  items: OPTIONS.filter((definition) => definition.group === group),
  value: GROUP_LABELS[group],
})).filter((group) => group.items.length > 0)

interface FileTypeSelectProps {
  disabled?: boolean
  onChange: (fileTypeId: FileTypeId) => void
  value: FileTypeId
}

export function FileTypeSelect({
  disabled = false,
  onChange,
  value,
}: FileTypeSelectProps) {
  const selected = OPTIONS.find((option) => option.id === value) ?? OPTIONS[0]!

  return (
    <Combobox.Root
      items={GROUPS}
      value={selected}
      disabled={disabled}
      isItemEqualToValue={(item, selectedItem) => item.id === selectedItem.id}
      itemToStringLabel={(item) => item.label}
      filter={(item, query) => {
        const normalizedQuery = query.trim().toLocaleLowerCase()
        if (!normalizedQuery) return true
        const searchableText = [
          item.label,
          ...item.extensions.flatMap((extension) => [
            extension,
            `.${extension}`,
          ]),
        ]
          .join(' ')
          .toLocaleLowerCase()
        return searchableText.includes(normalizedQuery)
      }}
      onValueChange={(option) => {
        if (option) onChange(option.id)
      }}
    >
      <Combobox.InputGroup className="select-control select-control--combobox">
        <Combobox.Input
          id="conversion-file-type"
          aria-label="目标文件类型"
          placeholder="搜索类型或扩展名"
          className="select-control__input"
        />
        <Combobox.Trigger
          className="select-control__icon-button"
          aria-label="展开文件类型"
        >
          <ChevronDown aria-hidden="true" />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner className="select-menu__positioner" sideOffset={6}>
          <Combobox.Popup className="select-menu__popup">
            <Combobox.Empty className="select-menu__empty">
              没有匹配的类型
            </Combobox.Empty>
            <Combobox.List className="select-menu__list">
              {(group: FileTypeOptionGroup) => (
                <Combobox.Group
                  key={group.value}
                  items={group.items}
                  className="select-menu__group"
                >
                  <Combobox.GroupLabel className="select-menu__group-label">
                    {group.value}
                  </Combobox.GroupLabel>
                  <Combobox.Collection>
                    {(item: FileTypeOption) => (
                      <Combobox.Item
                        key={item.id}
                        value={item}
                        className="select-menu__item select-menu__item--with-meta"
                      >
                        <span className="select-menu__indicator-slot">
                          <Combobox.ItemIndicator className="select-menu__indicator">
                            <Check aria-hidden="true" />
                          </Combobox.ItemIndicator>
                        </span>
                        <span className="select-menu__label">{item.label}</span>
                        <small className="select-menu__meta">
                          {item.extensions
                            .map((extension) => `.${extension}`)
                            .join(' · ') || '自定义扩展名'}
                        </small>
                      </Combobox.Item>
                    )}
                  </Combobox.Collection>
                </Combobox.Group>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
