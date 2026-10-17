import { fireEvent, render, screen } from '@testing-library/react'
import { createCatalogCalculationSnapshot } from '../../../domain/calculations'
import type { ItemCatalog } from '../../../domain/item.types'
import { ItemTree } from './ItemTree'

const catalog: ItemCatalog = {
  root: {
    id: 'root',
    name: 'Крафт',
    iconUrl: '',
    sections: ['crafts'],
    purchasePriceCopper: null,
    salePriceCopper: null,
    recipe: {
      outputQuantity: 1,
      profession: null,
      reagents: [{ itemId: 'reagent', quantity: 1, acquisition: 'buy' }],
    },
  },
  reagent: {
    id: 'reagent',
    name: 'Реагент',
    iconUrl: '',
    sections: ['reagents'],
    purchasePriceCopper: null,
    salePriceCopper: null,
    recipe: null,
  },
}

const props = {
  rootItemId: 'root',
  itemLanguage: 'ru' as const,
  catalog,
  calculationSnapshot: createCatalogCalculationSnapshot(catalog, new Set(), new Set()),
  onToggleExpanded: vi.fn(),
  onEditItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onSetAcquisition: vi.fn(),
}

function getBranch() {
  const branch = screen.getByText('Реагент').closest('.item-tree__expansion')
  if (branch === null) throw new Error('Ветка дерева отсутствует')
  return branch
}

describe('ItemTree', () => {
  it('показывает преобразование эссенций и останавливает ветку на покупке исходного материала', () => {
    const base = catalog.reagent
    if (!base) throw new Error('Отсутствует тестовый реагент')
    const essences: ItemCatalog = {
      small: {
        ...base,
        id: 'small',
        name: 'Малая эссенция',
        source: { wowheadItemId: 10938 },
      },
      large: {
        ...base,
        id: 'large',
        name: 'Большая эссенция',
        source: { wowheadItemId: 10939 },
      },
    }
    render(
      <ItemTree
        {...props}
        rootItemId="large"
        catalog={essences}
        calculationSnapshot={createCatalogCalculationSnapshot(
          essences,
          new Set(),
          new Set(),
        )}
        expandedPaths={new Set(['large', 'large/small', 'large/small/large'])}
      />,
    )
    expect(screen.getAllByText('Большая эссенция')).toHaveLength(1)
    expect(screen.getAllByText('Малая эссенция')).toHaveLength(1)
    expect(screen.getByText('× 3')).toBeInTheDocument()
    expect(screen.getByText('Покупка для преобразования')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Получать' })).not.toBeInTheDocument()
  })

  it('сохраняет ветку до конца закрытия и сразу исключает её из навигации', () => {
    const { rerender } = render(<ItemTree {...props} expandedPaths={new Set()} />)
    expect(screen.queryByText('Реагент')).not.toBeInTheDocument()
    rerender(<ItemTree {...props} expandedPaths={new Set(['root'])} />)
    const branch = getBranch()
    expect(branch).toHaveClass('item-tree__expansion--opening')
    fireEvent.animationEnd(branch)
    expect(branch).not.toHaveClass('item-tree__expansion--opening')
    expect(screen.getByText('Реагент')).toBeInTheDocument()
    rerender(<ItemTree {...props} expandedPaths={new Set()} />)
    expect(branch).toHaveAttribute('aria-hidden', 'true')
    expect(branch).toHaveAttribute('inert')
    expect(screen.getByText('Реагент')).toBeInTheDocument()
    fireEvent.animationEnd(screen.getByText('Реагент'))
    expect(screen.getByText('Реагент')).toBeInTheDocument()
    fireEvent.animationEnd(branch)
    expect(screen.queryByText('Реагент')).not.toBeInTheDocument()
    rerender(<ItemTree {...props} expandedPaths={new Set(['root'])} />)
    expect(screen.getByText('Реагент')).toBeInTheDocument()
    expect(getBranch()).toHaveClass('item-tree__expansion--opening')
  })

  it('сохраняет ветку при повторном раскрытии до завершения закрытия', () => {
    const { rerender } = render(<ItemTree {...props} expandedPaths={new Set(['root'])} />)
    const branch = getBranch()
    rerender(<ItemTree {...props} expandedPaths={new Set()} />)
    rerender(<ItemTree {...props} expandedPaths={new Set(['root'])} />)
    fireEvent.animationEnd(branch)
    expect(screen.getByText('Реагент')).toBeInTheDocument()
    expect(branch).toHaveAttribute('aria-hidden', 'false')
    expect(branch).not.toHaveAttribute('inert')
  })
})
