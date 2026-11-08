import {describe,expect,it} from 'vitest'
import {appV2Fixture} from '../../../../packages/schema/src/app-v2/fixture.test-utils'
import {configureBuilderV2Read,configureBuilderV2ScreenAccess} from './builder-v2-read-access'

describe('explicit published read access',()=>{
  it('splits shared grants without changing other roles or write rights',()=>{
    const app=appV2Fixture(),before=structuredClone(app)
    app.policy.tables[0]!.grants=[{audience:{kind:'roles',roleIds:['owner','worker']},read:{fieldIds:['r_title','r_owner'],rows:{kind:'all'}},update:{fieldIds:['r_title'],rows:{kind:'all'}}}]
    const next=configureBuilderV2Read(app,'requests',{kind:'roles',roleIds:['worker']},['r_title'],{kind:'owned',fieldId:'r_owner',property:'email'})
    const grants=next.policy.tables.find(rule=>rule.tableId==='requests')!.grants
    expect(grants).toContainEqual({audience:{kind:'roles',roleIds:['owner']},read:{fieldIds:['r_title','r_owner'],rows:{kind:'all'}},update:{fieldIds:['r_title'],rows:{kind:'all'}}})
    expect(grants).toContainEqual({audience:{kind:'roles',roleIds:['worker']},update:{fieldIds:['r_title'],rows:{kind:'all'}}})
    expect(grants).toContainEqual({audience:{kind:'roles',roleIds:['worker']},read:{fieldIds:['r_title'],rows:{kind:'owned',fieldId:'r_owner',property:'email'}}})
    expect(app.policy.tables[1]).toEqual(before.policy.tables[1])
  })
  it('removes the last read grant and preserves independently granted public access',()=>{
    const app=appV2Fixture();app.policy.tables=[{tableId:'requests',grants:[{audience:{kind:'roles',roleIds:['worker']},read:{fieldIds:['r_title'],rows:{kind:'all'}}},{audience:{kind:'public'},read:{fieldIds:['r_title'],rows:{kind:'all'}}}]}]
    const next=configureBuilderV2Read(app,'requests',{kind:'roles',roleIds:['worker']},[],{kind:'all'})
    expect(next.policy.tables[0]!.grants).toHaveLength(1)
    expect(next.policy.tables[0]!.grants[0]!.audience.kind).toBe('public')
    expect(configureBuilderV2Read(next,'requests',{kind:'public'},[],{kind:'all'}).policy.tables).toEqual([])
  })
  it('grants pure card navigation with screen access but keeps data and mutation actions unchanged',()=>{
    const app=appV2Fixture();app.screens[0]!.audience={kind:'roles',roleIds:['owner']}
    const next=configureBuilderV2ScreenAccess(app,app.screens[0]!.id,'worker',true)
    expect(next.screens[0]!.audience).toEqual({kind:'roles',roleIds:['owner','worker']})
    expect(next.policy.tables).toEqual(app.policy.tables)
    for(const id of['complete','create'])expect(next.policy.workflows.find(grant=>grant.workflowId===id)).toEqual(app.policy.workflows.find(grant=>grant.workflowId===id))
    const navigation=next.policy.workflows.find(grant=>grant.workflowId==='open_request')
    expect(navigation?.audience).toEqual({kind:'roles',roleIds:['owner','worker']})
  })
})
