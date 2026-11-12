#define UNICODE
#define _UNICODE
#define NOMINMAX
#include <windows.h>
#include <ole2.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <exdisp.h>
#include <shlguid.h>
#include <string>
#include <vector>
#include <deque>
#include <map>
#include <algorithm>
static std::deque<std::wstring> events;
static std::wstring quote(const std::wstring& value){std::wstring s=L"\"";for(auto c:value){if(c==L'\\'||c==L'\"')s+=L'\\';if(c>=32)s+=c;}return s+L"\"";}
static std::vector<std::wstring> paths(IDataObject* object){
  std::vector<std::wstring> list;FORMATETC fmt={CF_HDROP,nullptr,DVASPECT_CONTENT,-1,TYMED_HGLOBAL};STGMEDIUM medium={};
  if(!object||FAILED(object->GetData(&fmt,&medium)))return list;
  HDROP drop=(HDROP)medium.hGlobal;UINT n=std::min(DragQueryFileW(drop,0xffffffff,nullptr,0),1000u);
  for(UINT i=0;i<n;i++){UINT len=DragQueryFileW(drop,i,nullptr,0);std::wstring file(len+1,L'\0');DragQueryFileW(drop,i,file.data(),len+1);file.resize(len);list.push_back(file);}
  ReleaseStgMedium(&medium);return list;
}
static std::wstring jsonPaths(const std::vector<std::wstring>& files){std::wstring value=L"[";for(size_t i=0;i<files.size();i++){if(i)value+=L",";value+=quote(files[i]);}return value+L"]";}
static void emit(const wchar_t* type,POINTL p,const std::vector<std::wstring>& files){
  std::wstring e=L"{\"type\":"+quote(type)+L",\"x\":"+std::to_wstring(p.x)+L",\"y\":"+std::to_wstring(p.y)+L",\"paths\":"+jsonPaths(files)+L"}";
  if(events.size()>50)events.pop_front();if(std::wstring(type)==L"over"&&!events.empty()&&events.back().find(L"\"over\"")!=std::wstring::npos)events.back()=e;else events.push_back(e);
}
class Target:public IDropTarget{
  LONG refs=1;std::vector<std::wstring> files;
public:
  bool enabled=true;
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out)override{if(!out)return E_POINTER;*out=nullptr;if(id==IID_IUnknown||id==IID_IDropTarget){*out=this;AddRef();return S_OK;}return E_NOINTERFACE;}
  ULONG STDMETHODCALLTYPE AddRef()override{return InterlockedIncrement(&refs);}
  ULONG STDMETHODCALLTYPE Release()override{auto n=InterlockedDecrement(&refs);if(!n)delete this;return n;}
  HRESULT STDMETHODCALLTYPE DragEnter(IDataObject* data,DWORD,POINTL p,DWORD* effect)override{files=enabled?paths(data):std::vector<std::wstring>{};if(enabled)emit(L"enter",p,files);*effect=files.empty()?DROPEFFECT_NONE:(*effect&DROPEFFECT_COPY);return S_OK;}
  HRESULT STDMETHODCALLTYPE DragOver(DWORD,POINTL p,DWORD* effect)override{if(enabled)emit(L"over",p,{});*effect=!enabled||files.empty()?DROPEFFECT_NONE:(*effect&DROPEFFECT_COPY);return S_OK;}
  HRESULT STDMETHODCALLTYPE DragLeave()override{if(enabled)emit(L"leave",{0,0},{});files.clear();return S_OK;}
  HRESULT STDMETHODCALLTYPE Drop(IDataObject* data,DWORD,POINTL p,DWORD* effect)override{files=enabled?paths(data):std::vector<std::wstring>{};if(enabled)emit(L"drop",p,files);*effect=files.empty()?DROPEFFECT_NONE:(*effect&DROPEFFECT_COPY);files.clear();return S_OK;}
};
static std::map<HWND,Target*> targets;
extern "C" __declspec(dllexport) long InstallTarget(uintptr_t handle){
  HWND hwnd=(HWND)handle;if(targets.count(hwnd))return S_OK;HRESULT hr=OleInitialize(nullptr);if(FAILED(hr))return hr;
  RevokeDragDrop(hwnd);auto target=new Target();target->enabled=false;hr=RegisterDragDrop(hwnd,target);if(SUCCEEDED(hr))targets[hwnd]=target;else{target->Release();OleUninitialize();}return hr;
}
extern "C" __declspec(dllexport) void EnableTarget(uintptr_t handle,int enabled){auto it=targets.find((HWND)handle);if(it!=targets.end())it->second->enabled=enabled!=0;}
extern "C" __declspec(dllexport) void RemoveTarget(uintptr_t handle){auto it=targets.find((HWND)handle);if(it==targets.end())return;RevokeDragDrop(it->first);it->second->Release();targets.erase(it);OleUninitialize();}
static int copy(const std::wstring& s,wchar_t* buffer,int capacity){if(capacity<=(int)s.size())return -(int)s.size()-1;memcpy(buffer,s.c_str(),(s.size()+1)*sizeof(wchar_t));return (int)s.size();}
extern "C" __declspec(dllexport) int ReadEvent(wchar_t* buffer,int capacity){if(events.empty())return 0;int n=copy(events.front(),buffer,capacity);if(n>0)events.pop_front();return n;}
extern "C" __declspec(dllexport) int SelectedFiles(wchar_t* buffer,int capacity){
  std::vector<std::wstring> result;IShellWindows* windows=nullptr;HWND foreground=GetForegroundWindow();
  if(SUCCEEDED(CoCreateInstance(CLSID_ShellWindows,nullptr,CLSCTX_ALL,IID_PPV_ARGS(&windows)))){
    long count=0;windows->get_Count(&count);
    for(long i=0;i<count;i++){
      VARIANT index;VariantInit(&index);index.vt=VT_I4;index.lVal=i;IDispatch* dispatch=nullptr;
      if(FAILED(windows->Item(index,&dispatch))||!dispatch)continue;
      IWebBrowser2* browser=nullptr;if(SUCCEEDED(dispatch->QueryInterface(IID_PPV_ARGS(&browser)))){
        SHANDLE_PTR handle=0;browser->get_HWND(&handle);
        if((HWND)handle==foreground){IServiceProvider* services=nullptr;if(SUCCEEDED(browser->QueryInterface(IID_PPV_ARGS(&services)))){
          IShellBrowser* shell=nullptr;if(SUCCEEDED(services->QueryService(SID_STopLevelBrowser,IID_PPV_ARGS(&shell)))){
            IShellView* view=nullptr;if(SUCCEEDED(shell->QueryActiveShellView(&view))){IDataObject* data=nullptr;if(SUCCEEDED(view->GetItemObject(SVGIO_SELECTION,IID_PPV_ARGS(&data)))){result=paths(data);data->Release();}view->Release();}shell->Release();
          }services->Release();}
        }browser->Release();
      }dispatch->Release();if(!result.empty())break;
    }windows->Release();
  }return copy(jsonPaths(result),buffer,capacity);
}
