#include "../native/drop.cpp"
#include <cassert>
#include <iostream>
int wmain(int argc,wchar_t** argv){
  assert(argc==2);assert(SUCCEEDED(OleInitialize(nullptr)));
  PIDLIST_ABSOLUTE item=nullptr;assert(SUCCEEDED(SHParseDisplayName(argv[1],nullptr,&item,0,nullptr)));
  auto parent=ILCloneFull(item);ILRemoveLastID(parent);PCUITEMID_CHILD child=ILFindLastID(item);IDataObject* data=nullptr;
  assert(SUCCEEDED(SHCreateDataObject(parent,1,&child,nullptr,IID_PPV_ARGS(&data))));
  auto files=paths(data);assert(files.size()==1&&files[0]==argv[1]);
  auto target=new Target();DWORD effect=DROPEFFECT_COPY|DROPEFFECT_MOVE;
  assert(SUCCEEDED(target->DragEnter(data,MK_CONTROL,{100,200},&effect)));assert(effect==DROPEFFECT_COPY);
  wchar_t buffer[65536];int n=ReadEvent(buffer,65536);assert(n>0);assert(std::wstring(buffer).find(L"\"enter\"")!=std::wstring::npos);assert(std::wstring(buffer).find(quote(files[0]))!=std::wstring::npos);
  effect=DROPEFFECT_COPY|DROPEFFECT_MOVE;target->Drop(data,0,{110,210},&effect);assert(effect==DROPEFFECT_COPY);assert(ReadEvent(buffer,65536)>0);
  target->DragLeave();assert(ReadEvent(buffer,65536)>0);target->Release();data->Release();CoTaskMemFree(parent);CoTaskMemFree(item);
  HWND window=CreateWindowExW(0,L"STATIC",L"Filerrrr drop test",WS_POPUP,0,0,100,100,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);assert(window);
  assert(SUCCEEDED(InstallTarget((uintptr_t)window)));RemoveTarget((uintptr_t)window);DestroyWindow(window);OleUninitialize();
  std::cout<<"PASS: native IDataObject reads exact Unicode paths before drop, returns COPY only, and registers/revokes IDropTarget"<<std::endl;return 0;
}
