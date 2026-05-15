'use client'

interface Category {
  id: string
  name: string
  icon: string
}

interface Props {
  categories: Category[]
  selected: Category | null
  onSelect: (cat: Category) => void
}

export default function CategoryGrid({ categories, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {categories.map(cat => {
        const isSelected = selected?.id === cat.id
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat)}
            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 transition-all active:scale-95 ${
              isSelected
                ? 'border-primary bg-primary/10 shadow-sm'
                : 'border-gray-100 bg-gray-50 hover:border-gray-200'
            }`}
          >
            <span className="text-2xl">{cat.icon}</span>
            <span className={`text-xs text-center leading-tight font-medium ${
              isSelected ? 'text-primary' : 'text-gray-600'
            }`}>
              {cat.name.length > 6 ? cat.name.slice(0, 6) + '…' : cat.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
