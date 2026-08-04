// The fixture team roster, plus the dependent-completion rule over it: what
// `member` may be is decided by whichever `department` has already been filled
// in.
//
// Shared rather than duplicated because two fixtures deliberately name the same
// people — the `completable-prompt` prompt (see prompts/completions.ts) and the
// dynamic team-report resource template (see resources/templates.ts). They are
// the same dependent completion reached through the two halves of the
// completion ref union, `ref/prompt` and `ref/resource`, and identical data is
// what makes that pair readable as a comparison. Two copies would drift and
// quietly turn the comparison into a difference.

export const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Support'] as const

export const DEPARTMENT_MEMBERS: Record<string, string[]> = {
  Engineering: ['Alice', 'Bob', 'Charlie'],
  Sales: ['David', 'Eve', 'Frank'],
  Marketing: ['Grace', 'Henry', 'Iris'],
  Support: ['John', 'Kim', 'Lee']
}

export function completeDepartment(value: string): string[] {
  return DEPARTMENTS.filter((d) => d.startsWith(value))
}

// An unknown or absent department yields nothing rather than every member on
// the roster: the point of the fixture is that the second field stays empty
// until the first one says something useful.
export function completeMember(value: string, department: string | undefined): string[] {
  const members = department ? (DEPARTMENT_MEMBERS[department] ?? []) : []
  return members.filter((n) => n.startsWith(value))
}
