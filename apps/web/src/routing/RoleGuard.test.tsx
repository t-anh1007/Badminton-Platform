import { describe, expect, it } from 'vitest'
import { roleLabel } from '../components/RoleBadge.js'
describe('role labels', () => { it('uses approved Vietnamese labels', () => { expect(roleLabel('provider')).toBe('Chủ sân'); expect(roleLabel('admin')).toBe('Quản trị viên') }) })
