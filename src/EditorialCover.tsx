import { useState } from 'react';
import { edits } from '../mobile/src/editorial';
import field from '../mobile/assets/editorial/field.jpg';
import fieldWide from '../mobile/assets/editorial/field-wide.jpg';
import offDuty from '../mobile/assets/editorial/off-duty.jpg';
import accessories from '../mobile/assets/editorial/accessories.jpg';
import { BrandLink } from './StoreNavigation';

const photography = [field, offDuty, accessories];

export function EditorialCover({ hasStores, marketplace = false }: { hasStores: boolean; marketplace?: boolean }) {
  const [index, setIndex] = useState(0);
  const edit = edits[index];
  return (
    <section className="editorial-cover" aria-label="Style lookbook">
      <div className="cover-copy">
        <div className="look-selector" role="group" aria-label="Choose an edit">
          {edits.map((item, i) => (
            <button key={item.label} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="cover-heading" aria-live="polite" aria-atomic="true">
          <h1 key={edit.label}>{edit.firstLine} <em>{edit.secondLine}</em></h1>
          <p>{edit.description}</p>
        </div>
        {hasStores ? <button className="primary cover-action" onClick={() => {
          const collection = document.getElementById('collection');
          collection?.focus({ preventScroll: true });
          collection?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }}>Browse the collection <span aria-hidden="true">↗</span></button>
          : <BrandLink className="primary cover-action" href={marketplace ? "#/brands" : "#/merchant"}>{marketplace ? "Explore stores" : "Choose a demo store"} <span aria-hidden="true">↗</span></BrandLink>}
      </div>
      <div className="cover-photo">
        <picture key={edit.label}>
          {index === 0 && <source media="(max-width: 699px)" srcSet={fieldWide} />}
          <img src={photography[index]} alt={edit.alt} fetchPriority={index === 0 ? 'high' : 'auto'} />
        </picture>
      </div>
    </section>
  );
}
