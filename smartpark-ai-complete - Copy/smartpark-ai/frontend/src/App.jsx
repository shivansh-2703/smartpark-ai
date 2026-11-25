import React, { useEffect, useMemo, useState } from 'react'
import { Activity, CarFront, Camera, CircleParking, LayoutDashboard, Video, Wallet, Plus, RefreshCw, Upload, CheckCircle2, AlertCircle, Trash2, Play, Square, X } from 'lucide-react'

const API = 'http://127.0.0.1:8000'
async function request(path, options={}) {
  const res = await fetch(API + path, options)
  const data = await res.json().catch(()=>({detail:'Unexpected server response'}))
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data
}
const money = n => `₹${Number(n || 0).toFixed(2)}`
export default function App() {
  const [page,setPage] = useState('Overview')
  const [lots,setLots] = useState([])
  const [slots,setSlots] = useState([])
  const [sessions,setSessions] = useState([])
  const [stats,setStats] = useState({})
  const [selected,setSelected] = useState('LOT-01')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [slotCode,setSlotCode] = useState('')
  const [vehicle,setVehicle] = useState('')
  const [sessionSlot,setSessionSlot] = useState('')
  const [uploading,setUploading] = useState(false)

  async function refresh() {
    setBusy(true); setError('')
    try {
      const [l,s,se,d] = await Promise.all([request('/api/lots'),request('/api/slots'),request('/api/sessions'),request('/api/dashboard')])
      setLots(l); setSlots(s); setSessions(se); setStats(d)
      if (!l.some(x=>x.lot_number===selected) && l.length) setSelected(l[0].lot_number)
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(()=>{refresh(); const t=setInterval(refresh,10000); return ()=>clearInterval(t)},[])
  const currentLot = lots.find(l=>l.lot_number===selected)
  const currentSlots = slots.filter(s=>s.lot_number===selected)
  const activeSessions = sessions.filter(s=>s.status==='active')
  async function act(fn, success) { try { await fn(); setNotice(success); await refresh() } catch(e){setError(e.message)} }
  async function addSlot(e) {
    e.preventDefault(); if(!slotCode.trim()) return
    await act(()=>request(`/api/lots/${selected}/slots`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot_code:slotCode})}), 'Parking slot added')
    setSlotCode('')
  }
  async function toggleSlot(slot) {
    await act(()=>request(`/api/slots/${slot.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:slot.status==='available'?'occupied':'available'})}), 'Slot status updated')
  }
  async function deleteSlot(id) { if(!confirm('Delete this slot?')) return; await act(()=>request(`/api/slots/${id}`,{method:'DELETE'}),'Slot deleted') }
  async function uploadVideo(e) {
    const file=e.target.files?.[0]; if(!file)return
    const form=new FormData(); form.append('file',file); setUploading(true)
    await act(()=>request(`/api/videos/${selected}`,{method:'POST',body:form}),'Video uploaded successfully')
    setUploading(false); e.target.value=''
  }
  async function startSession(e) {
    e.preventDefault()
    if(!sessionSlot || !vehicle.trim()) return
    await act(()=>request('/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lot_number:selected,slot_id:Number(sessionSlot),vehicle_number:vehicle})}),'Parking session started')
    setVehicle('');setSessionSlot('')
  }
  async function closeSession(code) {
    await act(()=>request(`/api/sessions/${code}/close`,{method:'POST'}),'Session closed and fee calculated')
  }
  const videoUrl = currentLot?.video_filename ? `${API}/uploads/${selected.toLowerCase().replace('-','_')}/${currentLot.video_filename}` : ''
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandIcon"><CircleParking size={25}/></div><div><b>SmartPark</b><small>AI PARKING SYSTEM</small></div></div>
      <div className="navLabel">WORKSPACE</div>
      {[['Overview',LayoutDashboard],['Parking Lots',CarFront],['Video Monitoring',Video],['Sessions & Billing',Wallet]].map(([name,Icon])=><button key={name} className={`nav ${page===name?'active':''}`} onClick={()=>setPage(name)}><Icon size={18}/>{name}</button>)}
      <div className="sidebarBottom"><span className="liveDot"/> Local system <small>API · 127.0.0.1:8000</small></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><div className="eyebrow">SMART PARKING MANAGEMENT</div><h1>{page}</h1></div><div className="topActions"><span className="online"><i/> Backend connected</span><button className="iconBtn" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button></div></header>
      {error && <div className="alert error"><AlertCircle size={17}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
      {notice && <div className="alert success"><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
      {page==='Overview' && <>
        <section className="welcome"><div><span className="pill">● LIVE OVERVIEW</span><h2>Parking, made intelligent.</h2><p>Monitor all four parking lots from one place.</p></div><div className="welcomeArt"><CircleParking size={76}/></div></section>
        <section className="stats">
          <Stat icon={CircleParking} label="Total parking slots" value={stats.total_slots??'—'} tone="blue"/>
          <Stat icon={CarFront} label="Occupied slots" value={stats.occupied_slots??'—'} tone="red"/>
          <Stat icon={CheckCircle2} label="Available slots" value={stats.available_slots??'—'} tone="green"/>
          <Stat icon={Activity} label="Active sessions" value={stats.active_sessions??'—'} tone="purple"/>
        </section>
        <SectionTitle title="Parking lots" sub="Select a lot to manage its slots and camera."/>
        <div className="lotGrid">{lots.map(l=><LotCard key={l.id} lot={l} selected={selected===l.lot_number} onClick={()=>{setSelected(l.lot_number);setPage('Parking Lots')}}/>)}</div>
      </>}
      {page==='Parking Lots' && <><div className="toolbar"><div><SectionTitle title="Lot management" sub="Manage parking spaces for each camera."/></div><select value={selected} onChange={e=>setSelected(e.target.value)}>{lots.map(l=><option key={l.id}>{l.lot_number}</option>)}</select></div>
        {currentLot && <div className="panel lotDetail"><div className="panelHead"><div><span className="eyebrow">{currentLot.camera_id} · CAMERA</span><h2>{currentLot.name}</h2></div><span className="statusTag"><i/> Camera registered</span></div>
          <div className="slotSummary"><b>{currentSlots.length} <small>TOTAL SLOTS</small></b><b className="greenText">{currentSlots.filter(s=>s.status==='available').length} <small>AVAILABLE</small></b><b className="redText">{currentSlots.filter(s=>s.status==='occupied').length} <small>OCCUPIED</small></b></div>
          <div className="slotGrid">{currentSlots.map(s=><div className={`slot ${s.status}`} key={s.id}><div className="slotTop"><b>{s.slot_code}</b><button className="tinyIcon" onClick={()=>deleteSlot(s.id)} title="Delete slot"><Trash2 size={14}/></button></div><span>{s.status==='available'?'Available':'Occupied'}</span><button className="toggle" onClick={()=>toggleSlot(s)}>{s.status==='available'?'Mark occupied':'Mark available'}</button></div>)}</div>
          <form className="inlineForm" onSubmit={addSlot}><input value={slotCode} onChange={e=>setSlotCode(e.target.value)} placeholder="New slot ID e.g. L1-S07"/><button className="primary"><Plus size={16}/> Add slot</button></form>
          <p className="hint">Sample slots are editable demo records. Set up slot IDs and statuses to match the spaces visible in your camera video.</p>
        </div>}
      </>}
      {page==='Video Monitoring' && <><div className="toolbar"><SectionTitle title="Camera video" sub="Upload a video file for the selected parking lot."/><select value={selected} onChange={e=>setSelected(e.target.value)}>{lots.map(l=><option key={l.id}>{l.lot_number}</option>)}</select></div>
        <div className="panel videoPanel"><div className="panelHead"><div><span className="eyebrow">{currentLot?.camera_id || 'CAMERA'}</span><h2>{selected} · Video source</h2></div><label className="primary uploadBtn"><Upload size={16}/>{uploading?'Uploading...':'Upload video'}<input type="file" accept="video/*" onChange={uploadVideo} disabled={uploading}/></label></div>
          {videoUrl?<video className="video" controls src={videoUrl}/>:
          <div className="drop"><Video size={42}/><b>No video uploaded for this lot</b><span>Select an MP4, MOV, AVI, MKV or WEBM file to preview it here.</span><label className="secondary uploadBtn"><Upload size={16}/> Choose video<input type="file" accept="video/*" onChange={uploadVideo}/></label></div>}
          <p className="hint">Video upload and playback are enabled. Automatic AI slot detection is not yet calibrated for this camera.</p>
        </div>
      </>}
      {page==='Sessions & Billing' && <><SectionTitle title="Sessions & billing" sub="Start a parking session and close it to calculate the fee (₹30 per started hour)."/>
        <div className="panel"><h3>Start a session · {selected}</h3><form className="sessionForm" onSubmit={startSession}><select value={sessionSlot} onChange={e=>setSessionSlot(e.target.value)}><option value="">Select available slot</option>{currentSlots.filter(s=>s.status==='available').map(s=><option key={s.id} value={s.id}>{s.slot_code}</option>)}</select><input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Vehicle registration number" required/><button className="primary"><Play size={15}/> Start session</button></form></div>
        <div className="panel"><h3>Parking sessions</h3><div className="tableWrap"><table><thead><tr><th>Session</th><th>Lot / Slot</th><th>Vehicle</th><th>Started</th><th>Status</th><th>Fee</th><th/></tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td>{s.session_code}</td><td>{s.lot_number} / {s.slot_code}</td><td>{s.vehicle_number}</td><td>{new Date(s.started_at).toLocaleString()}</td><td><span className={`tag ${s.status}`}>{s.status}</span></td><td>{money(s.fee)}</td><td>{s.status==='active'&&<button className="smallBtn" onClick={()=>closeSession(s.session_code)}>Close & bill</button>}</td></tr>)}{!sessions.length&&<tr><td colSpan="7" className="empty">No parking sessions yet.</td></tr>}</tbody></table></div></div>
      </>}
      <footer>SmartPark AI · Local development MVP <span>Refreshes every 10 seconds</span></footer>
    </main>
  </div>
}
function Stat({icon:Icon,label,value,tone}){return <div className="stat"><div className={`statIcon ${tone}`}><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong></div></div>}
function SectionTitle({title,sub}){return <div className="sectionTitle"><h2>{title}</h2><p>{sub}</p></div>}
function LotCard({lot,selected,onClick}){const total=lot.total_slots||0,occ=lot.occupied_slots||0;return <button className={`lotCard ${selected?'chosen':''}`} onClick={onClick}><div className="lotCardTop"><div className="lotIcon"><CarFront size={20}/></div><span className="statusTag"><i/> Online</span></div><h3>{lot.lot_number}</h3><p>{lot.name} · {lot.camera_id}</p><div className="lotNumbers"><b>{total}<small> Total</small></b><span><em>{occ} occupied</em> · {total-occ} available</span></div><div className="progress"><i style={{width:`${total?occ/total*100:0}%`}}/></div><div className="cardFoot">Manage parking spaces <span>→</span></div></button>}
