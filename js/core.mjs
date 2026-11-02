export const APP_VERSION='Aulas Mimi MVP Pilot 0.1';
export const SCHEMA='1.0', COURSE='aulas-mimi';
export const STUDENT_KEY='aulas-mimi.pilot.learner.v1', TEACHER_KEY='aulas-mimi.pilot.teacher.v1';
export function uuid(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;return [...b].map((x,i)=>([4,6,8,10].includes(i)?'-':'')+x.toString(16).padStart(2,'0')).join('');}
export const clone=x=>JSON.parse(JSON.stringify(x));
export const canonical=x=>x&&typeof x==='object'?Array.isArray(x)?x.map(canonical):Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export function addDays(s,n){if(!validDate(s))throw Error('Date invalide.');const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const need=(ok,msg)=>{if(!ok)throw Error(msg);};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const ID=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const RESULTS=['correct','incorrect','partial','not_assessed'];
const FLAGS=['hintUsed','textVisible','translationVisible','modelRevealed','assessorPromptedAnswer','stimulusPresented'];
export function auditData(lesson,reviews,audio,flow){
 need(lesson.lessonId==='L001'&&lesson.courseId===COURSE,'La leçon attendue manque.');
 for(const [list,key]of [[lesson.targets,'targetId'],[lesson.dialogue,'lineId'],[lesson.activities,'activityId'],[reviews.reviews,'reviewId'],[audio.files,'audioId']])need(new Set(list.map(x=>x[key])).size===list.length,'Identifiants dupliqués.');
 need(equal(lesson.targetIds,['I001','I002']),'Les expressions attendues manquent.');
 need(equal(reviews.intervalDays,[1,2,4,7,16]),'Calendrier incompatible.');
 const aids=new Set(audio.files.map(a=>a.audioId));
 const scan=v=>{if(Array.isArray(v))return v.forEach(scan);if(plain(v))for(const[k,x]of Object.entries(v)){if(['audioId','fullAudioId','modelAudioId'].includes(k))need(aids.has(x),'Référence audio inconnue.');if(['audioIds','modelAudioIds','stimulusAudioIds'].includes(k))x.forEach(id=>need(aids.has(id),'Référence audio inconnue.'));scan(x);}};
 [lesson,reviews,flow].forEach(scan);
 for(const a of [...lesson.activities,...reviews.reviews])if(a.correctOptionId)need((a.options||a.audioOptions).some(o=>o.optionId===a.correctOptionId),'Réponse inconnue.');
 for(const a of audio.files)need(a.path.startsWith('audio/L001/1.0.0/')&&!a.path.includes('..')&&a.path.endsWith('.mp3'),'Chemin audio invalide.');
 return true;
}
export function newLearner(lesson,uuidFactory=uuid){
 return {schemaVersion:SCHEMA,fileKind:'learner',courseId:COURSE,learnerId:uuidFactory(),deviceId:uuidFactory(),contentVersion:lesson.contentVersion,scheduleVersion:1,appVersion:APP_VERSION,events:[],operationalState:{stepId:'welcome',sessionId:uuidFactory(),activityState:{},reviewQueue:[],currentReviewId:null,returnStep:'welcome'},preferences:{fontScale:1,rate:1},revision:0};
}
export function activityState(state,id){return state.operationalState.activityState[id]??={attempts:0,hintUsed:false,textVisible:false,translationVisible:false,modelRevealed:false,assessorPromptedAnswer:false,audioIds:[]};}
export function appendEvent(state,type,extra={},now=new Date()){
 const e={eventId:uuid(),learnerId:state.learnerId,deviceId:state.deviceId,lessonId:'L001',sessionId:state.operationalState.sessionId,contentVersion:state.contentVersion,scheduleVersion:1,occurredAt:now.toISOString(),localDate:localDate(now),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',sequence:state.events.length+1,source:'objective',type,...extra};state.events.push(e);return e;
}
export function requiredAudio(a){return a.audioOptions?.length?a.audioOptions.map(o=>o.audioId):a.stimulusAudioIds||[];}
export function makeAttempt(state,a,selected,now=new Date(),review=false){
 const s=activityState(state,a.reviewId||a.activityId);s.attempts++;
 const stimulus=requiredAudio(a).every(id=>s.audioIds.includes(id))&&requiredAudio(a).length>0;
 return appendEvent(state,review?'review_attempt':'attempt',{activityId:a.activityId||null,reviewId:a.reviewId||null,targetId:a.targetId||a.targetIds[0],selectedOptionId:selected,attemptNumber:s.attempts,firstAttempt:s.attempts===1,result:stimulus?(selected===a.correctOptionId?'correct':'incorrect'):'not_assessed',hintUsed:s.hintUsed,textVisible:s.textVisible,translationVisible:s.translationVisible,modelRevealed:s.modelRevealed,assessorPromptedAnswer:false,stimulusPresented:stimulus,modality:'audio',priorLessonTextExposure:state.events.some(e=>e.type==='support_viewed'&&e.textVisible)},now);
}
export function successfulReview(e){return e.result==='correct'&&e.attemptNumber===1&&FLAGS.every(k=>Object.hasOwn(e,k)&&e[k]===(k==='stimulusPresented'));}
export function schedule(state,lesson,reviews,today=localDate()){
 const done=state.events.find(e=>e.type==='lesson_completed');if(!done)return[];
 return lesson.targetIds.map(id=>{
  let stage=1,due=addDays(done.localDate,1),completed=false,lastPractice=null;
  for(const e of state.events){if(e.targetId!==id)continue;
   if(completed&&['attempt','review_attempt'].includes(e.type)&&(e.result==='incorrect'||e.hintUsed||e.modelRevealed)){stage=1;due=addDays(e.localDate,1);completed=false;}
   if(!['review_attempt','review_skipped'].includes(e.type)||!e.recommended)continue;
   const r=reviews.reviews.find(r=>r.reviewId===e.reviewId);if(!r||r.stage!==stage||e.localDate<due)continue;
   if(lastPractice===e.localDate)continue;lastPractice=e.localDate;
   if(e.type==='review_attempt'&&successfulReview(e)){if(stage===5){completed=true;due=null;}else{due=addDays(e.localDate,reviews.intervalDays[stage]);stage++;}}
   else due=addDays(e.localDate,1);
  }
  return {targetId:id,stage,due,completed,lastPractice,isDue:!completed&&due<=today};
 });
}
export function dueQueue(state,lesson,reviews,today=localDate()){
 if(state.events.some(e=>e.type==='review_session_started'&&e.localDate===today))return[];
 return schedule(state,lesson,reviews,today).filter(s=>s.isDue).sort((a,b)=>a.due.localeCompare(b.due)||a.stage-b.stage||a.targetId.localeCompare(b.targetId)).slice(0,3).map(s=>reviews.reviews.find(r=>r.targetId===s.targetId&&r.stage===s.stage).reviewId);
}
export function progress(state,lesson,reviews=null){
 const out=Object.fromEntries(lesson.targetIds.map(id=>[id,{presented:false,recognized:false,understood:false,retrievalDeclared:false,recovered:false,produced:false,automated:false}]));
 for(const e of state.events){if(e.type==='item_presented'&&out[e.targetId])out[e.targetId].presented=true;
  if(e.type==='oral_self_report'&&e.choiceId!=='listen_again')for(const id of e.targetIds||[])if(out[id])out[id].retrievalDeclared=true;
  if(['attempt','review_attempt'].includes(e.type)&&e.result==='correct'&&e.stimulusPresented&&out[e.targetId]){
   const a=lesson.activities.find(a=>a.activityId===e.activityId)||reviews?.reviews.find(a=>a.reviewId===e.reviewId);if(a?.type==='recognition'||a?.evidenceDimension==='recognition')out[e.targetId].recognized=true;if(a?.type==='comprehension'||a?.evidenceDimension==='comprehension')out[e.targetId].understood=true;
  }
 }
 return out;
}
export function exportLearner(state){return {...clone(state),exportedAt:new Date().toISOString()};}
export function validateLearner(p,lesson,reviews,audio){
 need(plain(p),'Ce fichier ne contient pas une copie de progrès.');
 need(p.schemaVersion===SCHEMA,'Version de copie incompatible. Gardez votre fichier d’origine.');
 need(p.fileKind==='learner'&&p.courseId===COURSE,'Ce fichier ne correspond pas aux progrès de Mimi.');
 need(!p.testOnly&&!p.fixtureOnly&&!String(p.learnerId).startsWith('TEST'),'Ce fichier de test ne peut pas servir de progrès réels.');
 need(ID(p.learnerId)&&ID(p.deviceId),'Identité de copie invalide.');
 need(['1.0.0','1.0.1'].includes(p.contentVersion)&&p.scheduleVersion===1,'Version de contenu ou de révision incompatible.');
 need(Array.isArray(p.events)&&p.events.length<=20000,'Historique invalide ou trop volumineux.');
 const knownEvents=new Set(['lesson_started','lesson_completed','item_presented','audio_played','audio_failed','support_viewed','attempt','oral_self_report','activity_skipped','review_session_started','review_attempt','review_skipped']);
 const ids=new Set(),aids=new Set(audio.files.map(a=>a.audioId)),targets=new Set(lesson.targetIds),activities=new Map(lesson.activities.map(a=>[a.activityId,a])),rs=new Map(reviews.reviews.map(r=>[r.reviewId,r]));
 for(const e of p.events){
  need(plain(e)&&ID(e.eventId)&&!ids.has(e.eventId),'L’historique contient un identifiant dupliqué ou invalide.');ids.add(e.eventId);
  need(e.learnerId===p.learnerId&&e.lessonId==='L001'&&knownEvents.has(e.type),'Référence inconnue dans l’historique.');
  need(['1.0.0','1.0.1'].includes(e.contentVersion)&&e.scheduleVersion===1,'Version d’événement incompatible.');
  need(validDate(e.localDate)&&typeof e.occurredAt==='string'&&Number.isFinite(Date.parse(e.occurredAt)),'Date invalide dans l’historique.');
  need(ID(e.sessionId)&&ID(e.deviceId)&&Number.isInteger(e.sequence)&&e.sequence>0,'Événement incomplet.');
  need(['objective','self_report','human'].includes(e.source),'Source d’événement invalide.');
  if(e.targetId)need(targets.has(e.targetId),'Expression inconnue dans l’historique.');
  if(e.targetIds)need(Array.isArray(e.targetIds)&&e.targetIds.every(id=>targets.has(id)),'Expressions inconnues.');
  if(e.activityId)need(activities.has(e.activityId),'Activité inconnue.');
  if(e.reviewId)need(rs.has(e.reviewId),'Révision inconnue.');
  if(e.audioId)need(aids.has(e.audioId),'Audio inconnu.');
  if(['attempt','review_attempt'].includes(e.type)){
   const a=e.type==='attempt'?activities.get(e.activityId):rs.get(e.reviewId);need(a&&a.correctOptionId,'Question inconnue.');
   need((a.options||a.audioOptions).some(o=>o.optionId===e.selectedOptionId),'Réponse inconnue.');
   need(e.targetId===(a.targetId||a.targetIds[0]),'Expression et activité ne correspondent pas.');
   need(Number.isInteger(e.attemptNumber)&&e.attemptNumber>=1&&e.firstAttempt===(e.attemptNumber===1),'Numéro de tentative invalide.');
   need(RESULTS.includes(e.result)&&FLAGS.every(k=>typeof e[k]==='boolean'),'Conditions de réponse incomplètes.');
   const expected=e.stimulusPresented?(e.selectedOptionId===a.correctOptionId?'correct':'incorrect'):'not_assessed';need(e.result===expected,'Le résultat ne correspond pas à la réponse enregistrée.');
   if(e.type==='review_attempt')need(typeof e.recommended==='boolean','Condition de révision manquante.');
  }
  if(e.type==='oral_self_report')need(e.activityId==='L001-RET01'&&['tried_without_model','tried_with_model','listen_again'].includes(e.choiceId)&&e.result==='not_assessed','Déclaration orale invalide.');
 }
 const o=p.operationalState;need(plain(o)&&['welcome','listen1','listen2','targets','recognition','comprehension','retrieval','completion','review'].includes(o.stepId),'Étape de reprise inconnue.');
 need(ID(o.sessionId)&&plain(o.activityState)&&Array.isArray(o.reviewQueue)&&o.reviewQueue.length<=3&&new Set(o.reviewQueue).size===o.reviewQueue.length&&o.reviewQueue.every(id=>rs.has(id)),'Reprise de séance invalide.');
 need(o.currentReviewId===null||rs.has(o.currentReviewId),'Révision de reprise inconnue.');
 need(['welcome','listen1','listen2','targets','recognition','comprehension','retrieval','completion'].includes(o.returnStep),'Étape de retour invalide.');
 for(const [id,s]of Object.entries(o.activityState)){need(activities.has(id)||rs.has(id),'Activité de reprise inconnue.');need(plain(s)&&Number.isInteger(s.attempts)&&s.attempts>=0&&['hintUsed','textVisible','translationVisible','modelRevealed','assessorPromptedAnswer'].every(k=>typeof s[k]==='boolean')&&Array.isArray(s.audioIds)&&s.audioIds.every(id=>aids.has(id)),'Conditions de reprise invalides.');}
 need(plain(p.preferences)&&[0.8,1].includes(p.preferences.rate)&&[1,1.15,1.3].includes(p.preferences.fontScale),'Préférences invalides.');
 return p;
}
export function parseLearner(text,...data){need(new TextEncoder().encode(text).length<=5*1024*1024,'Ce fichier dépasse la taille acceptée.');let p;try{p=JSON.parse(text);}catch{throw Error('Ce fichier n’est pas un JSON lisible. Votre copie actuelle est conservée.');}return validateLearner(p,...data);}
export function mergeEvents(oldEvents,newEvents){const out=clone(oldEvents),map=new Map(out.map(e=>[e.eventId,e]));for(const e of newEvents){if(map.has(e.eventId))need(equal(map.get(e.eventId),e),'Un même identifiant contient deux versions différentes. Importation annulée.');else{const c=clone(e);out.push(c);map.set(c.eventId,c);}}return out;}
export function newTeacher(){return {schemaVersion:SCHEMA,fileKind:'teacher',courseId:COURSE,learner:null,observations:[]};}
export function importTeacher(teacher,incoming){const out=clone(teacher);if(out.learner){need(out.learner.learnerId===incoming.learnerId,'Cette copie appartient à une autre personne.');out.learner.events=mergeEvents(out.learner.events,incoming.events);out.learner.exportedAt=incoming.exportedAt||null;}else out.learner=clone(incoming);return out;}
export function validateTeacher(p,...data){need(plain(p)&&p.schemaVersion===SCHEMA&&p.fileKind==='teacher'&&p.courseId===COURSE,'Copie du professeur incompatible.');if(p.learner)validateLearner(p.learner,...data);need(Array.isArray(p.observations)&&p.observations.length<=10000,'Observations invalides.');const ids=new Set();for(const o of p.observations){need(ID(o.observationId)&&!ids.has(o.observationId)&&validDate(o.localDate)&&typeof o.text==='string'&&o.text.length<=5000,'Observation invalide.');ids.add(o.observationId);need(['experience','pronunciation','understood','recovered','produced','automated'].includes(o.category)&&[null,'I001','I002'].includes(o.targetId)&&['none','hint','model','not_assessed'].includes(o.help),'Observation incohérente.');need(typeof o.context==='string'&&o.context.length<=1000,'Contexte invalide.');}return p;}
export function storeJSON(storage,key,value){try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
