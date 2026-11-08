import {expect,it} from 'vitest'
import {appV2UploadContextSchema} from './upload'
const scope={formId:'form_a',screenId:'screen_a',fieldId:'photos',revision:'a'.repeat(64),fingerprint:'b'.repeat(64)}
it('accepts only an explicit saved or published form context without claimed user or role permissions',()=>{
 expect(appV2UploadContextSchema.safeParse({...scope,kind:'working',appId:'app_a'}).success).toBe(true)
 expect(appV2UploadContextSchema.safeParse({...scope,kind:'published',slug:'orders',recordId:'row_a'}).success).toBe(true)
 for(const value of [{...scope,kind:'preview',appId:'app_a'},{...scope,kind:'working',appId:'app_a',roleIds:['owner']},{...scope,kind:'published',slug:'orders',fingerprint:'old'},{...scope,kind:'published',slug:'orders',fieldId:'../secret'}])expect(appV2UploadContextSchema.safeParse(value).success).toBe(false)
})
