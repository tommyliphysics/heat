import { useNavigate } from 'react-router-dom'
import { getCurrencySymbol } from '../data/currencies.ts'
import { formatQuantity } from '../lib/units.ts'
import type { ShoppingListEntry } from '../lib/report.ts'

type ShoppingListTableProps = {
  entries: ShoppingListEntry[]
}

function ShoppingListTable({ entries }: ShoppingListTableProps) {
  const navigate = useNavigate()
  if (entries.length === 0) return <p>No foods in this period.</p>

  function handleRowClick(foodId: string) {
    navigate('/inventory', { state: { focusFoodId: foodId } })
  }

  return (
    <div className="foods-table-wrap">
      <table className="foods-table shopping-list-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Quantity</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.foodId} onClick={() => handleRowClick(entry.foodId)}>
              <td>{entry.name}</td>
              <td className="cell-mono">{formatQuantity(entry)}</td>
              <td className="cell-mono">
                {getCurrencySymbol(entry.currency)}
                {entry.totalPrice.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ShoppingListTable
