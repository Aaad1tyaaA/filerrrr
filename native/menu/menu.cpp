// "Convert with Filerrrr" in the Windows 11 File Explorer menu (top level).
// Windows 11 shows packaged IExplorerCommand handlers there; this DLL is that handler. It sits next to
// Filerrrr.exe and, when clicked, starts "Filerrrr.exe --convert <every selected file>".
#include <windows.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <new>
#include <string>
#include <vector>

// {C1D5D6B0-3F0E-4E8A-9A5B-6F7E2A1C4B11}, also in AppxManifest.xml
static const CLSID CLSID_ConvertCommand = { 0xc1d5d6b0, 0x3f0e, 0x4e8a, { 0x9a, 0x5b, 0x6f, 0x7e, 0x2a, 0x1c, 0x4b, 0x11 } };
static HMODULE g_module;
static LONG g_objects;

#ifdef MENU_TRACE
static void Trace(const wchar_t* fmt, ...) {
  wchar_t path[MAX_PATH], line[512];
  GetTempPathW(MAX_PATH, path); PathAppendW(path, L"filerrrr-menu-trace.log");
  va_list a; va_start(a, fmt); _vsnwprintf_s(line, _TRUNCATE, fmt, a); va_end(a);
  HANDLE h = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS, 0, nullptr);
  if (h != INVALID_HANDLE_VALUE) { DWORD n; WriteFile(h, line, (DWORD)(wcslen(line) * 2), &n, nullptr); CloseHandle(h); }
}
#else
#define Trace(...)
#endif

static std::wstring ExePath() {
  wchar_t path[MAX_PATH];
  GetModuleFileNameW(g_module, path, MAX_PATH);
  PathRemoveFileSpecW(path);
  PathAppendW(path, L"Filerrrr.exe");
  return path;
}

class ConvertCommand final : public IExplorerCommand {
  LONG refs_ = 1;
 public:
  ConvertCommand() { InterlockedIncrement(&g_objects); }
  ~ConvertCommand() { InterlockedDecrement(&g_objects); }

  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    static const QITAB qit[] = { QITABENT(ConvertCommand, IExplorerCommand), { nullptr, 0 } };
    return QISearch(this, qit, riid, ppv);
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&refs_); }
  IFACEMETHODIMP_(ULONG) Release() override { LONG r = InterlockedDecrement(&refs_); if (!r) delete this; return r; }

  IFACEMETHODIMP GetTitle(IShellItemArray*, LPWSTR* name) override { return SHStrDupW(L"Convert with Filerrrr", name); }
  IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override { return SHStrDupW((ExePath() + L",0").c_str(), icon); }
  IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }
  IFACEMETHODIMP GetCanonicalName(GUID* guid) override { *guid = CLSID_ConvertCommand; return S_OK; }
  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override { *flags = ECF_DEFAULT; return S_OK; }
  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** e) override { *e = nullptr; return E_NOTIMPL; }

  // Files only: the entry is hidden when the selection holds a folder.
  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    *state = ECS_ENABLED;
    SFGAOF attrs = 0;
    HRESULT hr = items ? items->GetAttributes(SIATTRIBFLAGS_OR, SFGAO_FOLDER, &attrs) : E_POINTER;
    if (FAILED(hr) || (attrs & SFGAO_FOLDER)) *state = ECS_HIDDEN;
    Trace(L"GetState items=%p hr=0x%08x attrs=0x%08x -> %d\r\n", items, hr, attrs, *state);
    return S_OK;
  }

  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override {
    if (!items) return S_OK;
    DWORD count = 0;
    items->GetCount(&count);
    std::wstring cmd = L"\"" + ExePath() + L"\" --convert";
    for (DWORD i = 0; i < count; i++) {
      IShellItem* item = nullptr;
      if (FAILED(items->GetItemAt(i, &item))) continue;
      LPWSTR path = nullptr;
      if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path))) {
        if (cmd.size() + wcslen(path) + 4 < 32000) cmd += L" \"" + std::wstring(path) + L"\""; // the command line limit is 32767
        CoTaskMemFree(path);
      }
      item->Release();
    }
    std::vector<wchar_t> buf(cmd.begin(), cmd.end());
    buf.push_back(L'\0');
    STARTUPINFOW si = { sizeof si };
    PROCESS_INFORMATION pi = {};
    if (CreateProcessW(nullptr, buf.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) {
      AllowSetForegroundWindow(pi.dwProcessId); // so the palette can come to the front
      CloseHandle(pi.hThread);
      CloseHandle(pi.hProcess);
    }
    return S_OK;
  }
};

class Factory final : public IClassFactory {
 public:
  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    static const QITAB qit[] = { QITABENT(Factory, IClassFactory), { nullptr, 0 } };
    return QISearch(this, qit, riid, ppv);
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return 2; }   // static object
  IFACEMETHODIMP_(ULONG) Release() override { return 1; }
  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
    *ppv = nullptr;
    if (outer) return CLASS_E_NOAGGREGATION;
    auto* cmd = new (std::nothrow) ConvertCommand();
    if (!cmd) return E_OUTOFMEMORY;
    HRESULT hr = cmd->QueryInterface(riid, ppv);
    cmd->Release();
    return hr;
  }
  IFACEMETHODIMP LockServer(BOOL lock) override { lock ? InterlockedIncrement(&g_objects) : InterlockedDecrement(&g_objects); return S_OK; }
};

STDAPI DllGetClassObject(REFCLSID clsid, REFIID riid, void** ppv) {
  static Factory factory;
  if (clsid != CLSID_ConvertCommand) { *ppv = nullptr; return CLASS_E_CLASSNOTAVAILABLE; }
  return factory.QueryInterface(riid, ppv);
}
STDAPI DllCanUnloadNow() { return g_objects == 0 ? S_OK : S_FALSE; }

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) { g_module = module; DisableThreadLibraryCalls(module); }
  return TRUE;
}
