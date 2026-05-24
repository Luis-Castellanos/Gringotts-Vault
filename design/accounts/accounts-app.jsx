// accounts-app.jsx — single live page wrapping V1Plus.

const { useEffect } = React;
const { V1Plus,
        TweaksPanel, TweakSection, TweakRadio, TweakToggle, useTweaks } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "regular",
  "privacy": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.setAttribute("data-density", t.density);
    r.setAttribute("data-privacy", t.privacy ? "on" : "off");
  }, [t.theme, t.density, t.privacy]);

  return (
    <>
      <V1Plus />

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio  label="Theme"   value={t.theme}   options={["light", "dark"]}
                     onChange={(v) => setTweak("theme", v)} />
        <TweakRadio  label="Density" value={t.density} options={["compact", "regular", "comfy"]}
                     onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Privacy" />
        <TweakToggle label="Hide balances" value={t.privacy}
                     onChange={(v) => setTweak("privacy", v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
