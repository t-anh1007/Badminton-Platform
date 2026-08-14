import { describe, expect, it } from 'vitest'
import { roleLabel } from './RoleBadge.js'
describe('RoleSwitcher labels', () => { it('labels player context', () => expect(roleLabel('player')).toBe('Người chơi')) })
