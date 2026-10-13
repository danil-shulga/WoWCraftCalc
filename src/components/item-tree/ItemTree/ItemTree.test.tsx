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
  it('сохраняет ветку до конца закрытия и сразу исключает её из навигации', () => {
    const { rerender } = render(<ItemTree {...props} expandedPaths={new Set()} />)
    expect(screen.queryByText('Реагент')).not.toBeInTheDocument()
    rerender(<ItemTree {...props} expandedPaths={new Set(['root'])} />)
    const branch = getBranch()
    fireEvent.animationEnd(branch)
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
