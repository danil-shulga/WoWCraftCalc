import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserSettingsModal } from './UserSettingsModal'

describe('UserSettingsModal', () => {
  it('передаёт переключение RU/EN и показывает активный язык', async () => {
    const user = userEvent.setup()
    const onItemLanguageChange = vi.fn()
    render(
      <UserSettingsModal
        catalog={{}}
        onItemNamesApply={vi.fn(() => null)}
        ownedProfessions={[]}
        currencyDisplay="icons"
        itemLanguage="ru"
        onItemLanguageChange={onItemLanguageChange}
        onProfessionChange={vi.fn()}
        onCurrencyDisplayChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'RU' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(onItemLanguageChange).toHaveBeenCalledWith('en')
  })

  it('передаёт изменение выбранной профессии', async () => {
    const user = userEvent.setup()
    const handleProfessionChange = vi.fn()

    render(
      <UserSettingsModal
        catalog={{}}
        onItemNamesApply={vi.fn(() => null)}
        ownedProfessions={['engineering']}
        currencyDisplay="icons"
        itemLanguage="ru"
        onItemLanguageChange={vi.fn()}
        onProfessionChange={handleProfessionChange}
        onCurrencyDisplayChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /Инженерное дело/ })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /Горное дело/ }))

    expect(handleProfessionChange).toHaveBeenCalledWith('mining', true)
  })

  it('передаёт выбранный способ отображения валют', async () => {
    const user = userEvent.setup()
    const handleCurrencyDisplayChange = vi.fn()

    render(
      <UserSettingsModal
        catalog={{}}
        onItemNamesApply={vi.fn(() => null)}
        ownedProfessions={[]}
        currencyDisplay="icons"
        itemLanguage="ru"
        onItemLanguageChange={vi.fn()}
        onProfessionChange={vi.fn()}
        onCurrencyDisplayChange={handleCurrencyDisplayChange}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('radio', { name: /^Буквы/ }))

    expect(handleCurrencyDisplayChange).toHaveBeenCalledWith('text')
  })
})
