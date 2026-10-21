import { Button } from './components.jsx';

export default function CacheImageWarning({ text, onClose }) {
  if (!text) return null;
  return <div className="write-box is-warn" role="status"><div className="toolbar"><span>{text}</span><span className="spacer" />{onClose && <Button onClick={onClose}>知道了</Button>}</div></div>;
}
