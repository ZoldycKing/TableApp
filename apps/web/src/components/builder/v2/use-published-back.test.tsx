// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {usePublishedV2Back} from './use-published-back'
import {appV2Fixture} from './fixture.test-utils'
afterEach(cleanup)
it('returns through an app-created entry and retains that ability after a reload',()=>{
  const app=appV2Fixture(),router={back:vi.fn(),replace:vi.fn()},home={screenId:app.homeScreenId!},detail={screenId:'detail',recordId:'row_A'}
  window.history.replaceState({},'',`/a/${app.slug}?screen=${home.screenId}`)
  const hook=renderHook(({current})=>usePublishedV2Back(app,current,router),{initialProps:{current:home as {screenId:string;recordId?:string}}})
  act(()=>hook.result.current.beforeNavigate(detail))
  window.history.pushState({},'',`/a/${app.slug}?screen=detail&row=row_A`)
  hook.rerender({current:detail});act(()=>hook.result.current.back(home.screenId));expect(router.back).toHaveBeenCalledTimes(1);expect(router.replace).not.toHaveBeenCalled()
  hook.unmount();const reloaded=renderHook(()=>usePublishedV2Back(app,detail,router));act(()=>reloaded.result.current.back(home.screenId));expect(router.back).toHaveBeenCalledTimes(2)
})
it('stays inside the app on a direct link, a foreign marker or a removed previous screen',()=>{
  const app=appV2Fixture(),router={back:vi.fn(),replace:vi.fn()},detail={screenId:'detail',recordId:'row_A'},home=app.homeScreenId!
  window.history.replaceState({tableappV2PublishedBack:{scope:'another-app',from:{screenId:home},to:detail}},'',`/a/${app.slug}?screen=detail&row=row_A`)
  const hook=renderHook(()=>usePublishedV2Back(app,detail,router));act(()=>hook.result.current.back(home));expect(router.replace).toHaveBeenCalledWith(`/a/${app.slug}?screen=${home}`);expect(router.back).not.toHaveBeenCalled()
  window.history.replaceState({tableappV2PublishedBack:{scope:`${app.slug}:/a/${app.slug}`,from:{screenId:'removed'},to:detail}},'',window.location.href)
  act(()=>hook.result.current.back(home));expect(router.back).not.toHaveBeenCalled()
})
