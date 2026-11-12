// Écran provisoire pour les fonctionnalités des prochaines étapes.
export function Bientot(props: { title: string; step: number; text: string }) {
  return (
    <main className="screen">
      <div className="screen-head">
        <h1 className="screen-title">{props.title}</h1>
      </div>
      <section className="card">
        <span className="eyebrow">Bientôt · étape {props.step}</span>
        <span className="muted">{props.text}</span>
      </section>
    </main>
  );
}
