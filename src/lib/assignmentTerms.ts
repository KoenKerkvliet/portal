// Standaardparagraaf over de reactietermijn op ontwerpen, die je met een vinkje aan een
// opdrachtomschrijving toevoegt. De paragraaf wordt als vaste tekst achter de inhoud
// gezet (tussen markeringen), zodat een geaccepteerde opdracht precies bevat wat de
// klant heeft gezien en het vinkje bij bewerken weer klopt.

const START = '<!--dp:feedbacktermijn-->'
const END = '<!--/dp:feedbacktermijn-->'

export const FEEDBACK_TERMS_HTML =
  `${START}<p><strong>Feedback op de ontwerpen</strong></p>` +
  '<p>Bij elk ontwerp dat ik je stuur, staat een uiterlijke datum voor je reactie, in principe 5 werkdagen na het versturen.' +
  'Ontvang ik vóór die datum geen reactie, dan ga ik ervan uit dat het ontwerp akkoord is en ga ik verder met de volgende stap. ' +
  'Zo blijft het tijdpad voor ons allebei haalbaar. Wil je daarna toch nog iets aanpassen aan een onderdeel dat al is afgerond, ' +
  `dan kan dat als meerwerk worden gerekend.</p>${END}`

const BLOCK = new RegExp(`${START}[\\s\\S]*?${END}`, 'g')

export const hasFeedbackTerms = (content: string) => content.includes(START)

// Inhoud zonder de standaardparagraaf (voor in de editor)
export const stripFeedbackTerms = (content: string) => content.replace(BLOCK, '')

// Inhoud om op te slaan: de paragraaf achteraan als het vinkje aan staat
export const withFeedbackTerms = (content: string, include: boolean) =>
  include ? `${stripFeedbackTerms(content)}${FEEDBACK_TERMS_HTML}` : stripFeedbackTerms(content)
