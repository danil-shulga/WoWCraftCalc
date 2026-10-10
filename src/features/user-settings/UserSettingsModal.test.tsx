import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UserSettingsModal } from './UserSettingsModal'

describe('UserSettingsModal', () => {
  it('передаёт изменение выбранной профессии', async () => {
    const user = userEvent.setup()
    const handleProfessionChange = vi.fn()

    render(
      <UserSettingsModal
        ownedProfessions={['engineering']}
        currencyDisplay="icons"
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
        ownedProfessions={[]}
        currencyDisplay="icons"
        onProfessionChange={vi.fn()}
        onCurrencyDisplayChange={handleCurrencyDisplayChange}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('radio', { name: /^Буквы/ }))

    expect(handleCurrencyDisplayChange).toHaveBeenCalledWith('text')
  })
})
