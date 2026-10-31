// Política de privacidade e termos de uso (PT/EN/ES), pensados para a LGPD (Brasil) e o GDPR (Europa).
// É um modelo sólido, mas precisa ser revisado por um advogado antes da venda.
// Os dados da empresa vêm das variáveis de ambiente (ver .env.example).
import type { Lang } from "@/core/types";

export interface Company { name: string; id: string; email: string; address: string; updated: string }

const MISSING = "[preencher]";
export function company(): Company {
  return {
    name: process.env.NEXT_PUBLIC_COMPANY_NAME || MISSING,
    id: process.env.NEXT_PUBLIC_COMPANY_ID || MISSING,
    email: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || MISSING,
    address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || MISSING,
    updated: "2026-10-31",
  };
}

export interface LegalDoc { title: string; updated: string; intro: string; sections: { h: string; p: string[] }[] }

export function privacy(lang: Lang, c: Company): LegalDoc {
  if (lang === "en") return {
    title: "Privacy Policy", updated: `Last updated: ${c.updated}`,
    intro: `This policy explains how Navalha, operated by ${c.name} (${c.id}), and the barbershops that use it handle your personal data. It follows Brazil's LGPD (Law 13,709/2018) and the EU General Data Protection Regulation (GDPR).`,
    sections: [
      { h: "1. Who is responsible", p: [
        "Each barbershop is the controller of its own customers' data: it decides what to record about your visits.",
        `${c.name} provides the Navalha software and acts as processor for that data, following the barbershop's instructions. For the accounts of barbershop owners and staff, ${c.name} is the controller.`,
        `Privacy contact (Data Protection Officer / Encarregado): ${c.email}.`,
      ] },
      { h: "2. What we collect", p: [
        "Customers: name, WhatsApp number (used as your login), booking history, plans and payments, preferences and notes written by the barbershop, language, and — only if you allow it — photos for haircut suggestions.",
        "Staff: name, WhatsApp number, access level and, for barbers, photo, commission or chair-rent settings and goals.",
        "Technical: login session cookies and security logs (date, time and action). We do not use advertising or tracking cookies.",
      ] },
      { h: "3. Why and on what legal basis", p: [
        "To book, remind and provide your appointments and plans — performance of a contract (LGPD art. 7 V; GDPR art. 6(1)(b)).",
        "To send appointment reminders and plan expiry notices, prevent abuse and keep the service secure — legitimate interest (LGPD art. 7 IX; GDPR art. 6(1)(f)). You can object at any time.",
        "To keep payment and service records required by tax law — legal obligation (LGPD art. 7 II; GDPR art. 6(1)(c)).",
        "Photos and promotional messages — only with your consent (LGPD art. 7 I; GDPR art. 6(1)(a)), which you can withdraw in the app at any time.",
      ] },
      { h: "4. Who we share it with", p: [
        "Only with providers needed to run the service, under contract and confidentiality: database and hosting (Supabase, Vercel), messaging (Twilio, Meta/WhatsApp) and payments (the provider chosen by the barbershop).",
        "We never sell your data. Staff of a barbershop only see that barbershop's data, and each level only sees what the owner allows.",
      ] },
      { h: "5. International transfers", p: [
        "Some providers may store data outside your country. When that happens we use the safeguards required by law, such as standard contractual clauses (LGPD art. 33; GDPR chapter V). Barbershops in Europe can have their data hosted in the European Union.",
      ] },
      { h: "6. How long we keep it", p: [
        "While you are a customer of the barbershop. If you delete your account, your profile, plan, photos and style projects are erased; past services and payments stay only as anonymous figures for the barbershop's accounting, for the period required by tax law (in Brazil, 5 years).",
        "Security logs are kept for up to 6 months (Brazilian Internet Act, art. 15).",
      ] },
      { h: "7. Your rights", p: [
        "You can confirm and access your data, correct it, download it (portability), delete it, object to or restrict a use, withdraw consent and ask who it was shared with.",
        "In the barbershop's app open Home → My data to download or delete everything yourself. For anything else write to the barbershop or to " + c.email + ". We reply within 15 days (LGPD) or one month (GDPR).",
        "You may also complain to the data protection authority: ANPD in Brazil (gov.br/anpd) or the authority of your EU country.",
      ] },
      { h: "8. Security", p: [
        "Encrypted connections (HTTPS), login by one-time code sent to your WhatsApp, row-level access rules in the database (each barbershop only reaches its own data), private photo storage, automatic security tests on every change and access logs. No system is 100% immune; if an incident puts you at risk we will notify you and the authorities as the law requires.",
      ] },
      { h: "9. Children", p: [
        "The app is meant for people aged 18 or over. Appointments for minors must be made by a parent or guardian.",
      ] },
      { h: "10. Changes", p: ["We will announce relevant changes in the app before they take effect."] },
    ],
  };
  if (lang === "es") return {
    title: "Política de privacidad", updated: `Actualizada el ${c.updated}`,
    intro: `Esta política explica cómo Navalha, operado por ${c.name} (${c.id}), y las barberías que lo usan tratan tus datos personales. Sigue la LGPD de Brasil (Ley 13.709/2018) y el Reglamento General de Protección de Datos de la UE (RGPD).`,
    sections: [
      { h: "1. Quién es responsable", p: [
        "Cada barbería es responsable de los datos de sus clientes: decide qué registra sobre tus visitas.",
        `${c.name} ofrece el software Navalha y actúa como encargado del tratamiento de esos datos, siguiendo las instrucciones de la barbería. Para las cuentas de dueños y equipo, ${c.name} es el responsable.`,
        `Contacto de privacidad (Delegado de Protección de Datos): ${c.email}.`,
      ] },
      { h: "2. Qué datos recogemos", p: [
        "Clientes: nombre, número de WhatsApp (que es tu acceso), historial de turnos, planes y pagos, preferencias y notas de la barbería, idioma y, solo si lo autorizas, fotos para sugerencias de corte.",
        "Equipo: nombre, WhatsApp, nivel de acceso y, para barberos, foto, comisión o alquiler de silla y metas.",
        "Técnicos: cookies de sesión y registros de seguridad (fecha, hora y acción). No usamos cookies de publicidad ni de seguimiento.",
      ] },
      { h: "3. Para qué y con qué base legal", p: [
        "Reservar, recordar y prestar tus turnos y planes: ejecución de contrato (LGPD art. 7 V; RGPD art. 6.1.b).",
        "Enviar recordatorios y avisos de vencimiento de plan, evitar abusos y mantener la seguridad: interés legítimo (LGPD art. 7 IX; RGPD art. 6.1.f). Puedes oponerte cuando quieras.",
        "Guardar registros de servicios y pagos exigidos por la ley fiscal: obligación legal (LGPD art. 7 II; RGPD art. 6.1.c).",
        "Fotos y mensajes promocionales: solo con tu consentimiento (LGPD art. 7 I; RGPD art. 6.1.a), que puedes retirar en la app.",
      ] },
      { h: "4. Con quién compartimos", p: [
        "Solo con proveedores necesarios para el servicio, con contrato y confidencialidad: base de datos y alojamiento (Supabase, Vercel), mensajes (Twilio, Meta/WhatsApp) y pagos (el proveedor elegido por la barbería).",
        "Nunca vendemos tus datos. El equipo de una barbería solo ve los datos de esa barbería, y cada nivel solo lo que el dueño permite.",
      ] },
      { h: "5. Transferencias internacionales", p: [
        "Algunos proveedores pueden guardar datos fuera de tu país. En ese caso usamos las garantías exigidas por la ley, como cláusulas contractuales tipo (LGPD art. 33; RGPD capítulo V). Las barberías en Europa pueden tener sus datos alojados en la Unión Europea.",
      ] },
      { h: "6. Cuánto tiempo los guardamos", p: [
        "Mientras seas cliente de la barbería. Si borras tu cuenta, se eliminan tu ficha, plan, fotos y proyectos de estilo; los servicios y pagos pasados quedan solo como cifras anónimas para la contabilidad de la barbería, durante el plazo exigido por la ley fiscal.",
        "Los registros de seguridad se guardan hasta 6 meses.",
      ] },
      { h: "7. Tus derechos", p: [
        "Puedes acceder a tus datos, corregirlos, descargarlos (portabilidad), borrarlos, oponerte o limitar un uso, retirar el consentimiento y saber con quién se compartieron.",
        "En la app de la barbería abre Inicio → Mis datos para descargar o borrar todo tú mismo. Para lo demás escribe a la barbería o a " + c.email + ". Respondemos en 15 días (LGPD) o un mes (RGPD).",
        "También puedes reclamar ante la autoridad de protección de datos: la ANPD en Brasil o la autoridad de tu país (en España, la AEPD).",
      ] },
      { h: "8. Seguridad", p: [
        "Conexión cifrada (HTTPS), acceso con código de un solo uso enviado a tu WhatsApp, reglas de acceso por fila en la base de datos (cada barbería solo llega a sus datos), fotos en almacenamiento privado, pruebas de seguridad automáticas en cada cambio y registros de acceso. Ningún sistema es 100% inmune; si un incidente te pone en riesgo te avisaremos a ti y a las autoridades como exige la ley.",
      ] },
      { h: "9. Menores", p: ["La app está pensada para mayores de 18 años. Los turnos de menores los debe hacer su padre, madre o tutor."] },
      { h: "10. Cambios", p: ["Avisaremos en la app los cambios relevantes antes de que entren en vigor."] },
    ],
  };
  return {
    title: "Política de privacidade", updated: `Atualizada em ${c.updated.split("-").reverse().join("/")}`,
    intro: `Esta política explica como o Navalha, operado por ${c.name} (${c.id}), e as barbearias que usam o Navalha tratam os seus dados pessoais. Ela segue a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018) e o Regulamento Geral de Proteção de Dados da União Europeia (GDPR).`,
    sections: [
      { h: "1. Quem é responsável", p: [
        "Cada barbearia é a controladora dos dados dos seus clientes: é ela quem decide o que registra sobre os seus atendimentos.",
        `${c.name} fornece o sistema Navalha e é operadora desses dados, seguindo as instruções da barbearia. Para as contas dos donos e da equipe das barbearias, ${c.name} é a controladora.`,
        `Encarregado de proteção de dados (DPO): ${c.email}.`,
      ] },
      { h: "2. Quais dados coletamos", p: [
        "Clientes: nome, número do WhatsApp (que é o seu login), histórico de agendamentos, planos e pagamentos, preferências e observações anotadas pela barbearia, idioma e, só se você autorizar, fotos para sugestão de corte.",
        "Equipe: nome, WhatsApp, nível de acesso e, para barbeiros, foto, comissão ou aluguel de cadeira e metas.",
        "Técnicos: cookies de sessão do login e registros de segurança (data, hora e ação). Não usamos cookies de propaganda nem de rastreamento.",
      ] },
      { h: "3. Para que usamos e com qual base legal", p: [
        "Agendar, lembrar e prestar os seus atendimentos e planos: execução de contrato (LGPD art. 7º, V; GDPR art. 6(1)(b)).",
        "Mandar lembretes de horário e aviso de plano vencendo, evitar abusos e manter o sistema seguro: legítimo interesse (LGPD art. 7º, IX; GDPR art. 6(1)(f)). Você pode se opor quando quiser.",
        "Guardar registros de atendimentos e pagamentos exigidos pela lei fiscal: cumprimento de obrigação legal (LGPD art. 7º, II; GDPR art. 6(1)(c)).",
        "Fotos e mensagens promocionais: só com o seu consentimento (LGPD art. 7º, I; GDPR art. 6(1)(a)), que você pode retirar no app a qualquer momento.",
      ] },
      { h: "4. Com quem compartilhamos", p: [
        "Só com fornecedores necessários para o serviço funcionar, sob contrato e sigilo: banco de dados e hospedagem (Supabase, Vercel), envio de mensagens (Twilio, Meta/WhatsApp) e pagamentos (o provedor escolhido pela barbearia).",
        "Nunca vendemos os seus dados. A equipe de uma barbearia só enxerga os dados daquela barbearia, e cada nível só vê o que o dono liberar.",
      ] },
      { h: "5. Transferência internacional", p: [
        "Alguns fornecedores podem guardar dados fora do seu país. Quando isso acontece, usamos as garantias exigidas pela lei, como cláusulas contratuais padrão (LGPD art. 33; GDPR capítulo V). Barbearias na Europa podem ter os dados hospedados na União Europeia.",
      ] },
      { h: "6. Por quanto tempo guardamos", p: [
        "Enquanto você for cliente da barbearia. Se você apagar o seu cadastro, somem a sua ficha, plano, fotos e projetos de visual; os atendimentos e pagamentos passados ficam só como números sem nome, para a contabilidade da barbearia, pelo prazo da lei fiscal (5 anos no Brasil).",
        "Registros de segurança ficam guardados por até 6 meses (Marco Civil da Internet, art. 15).",
      ] },
      { h: "7. Seus direitos", p: [
        "Você pode confirmar e acessar os seus dados, corrigir, baixar uma cópia (portabilidade), apagar, se opor ou limitar um uso, retirar o consentimento e saber com quem eles foram compartilhados.",
        "No app da barbearia, abra Início → Meus dados para baixar ou apagar tudo sozinho. Para o resto, fale com a barbearia ou escreva para " + c.email + ". Respondemos em até 15 dias (LGPD) ou um mês (GDPR).",
        "Você também pode reclamar com a autoridade de proteção de dados: a ANPD no Brasil (gov.br/anpd) ou a autoridade do seu país na Europa.",
      ] },
      { h: "8. Segurança", p: [
        "Conexão criptografada (HTTPS), login por código de uso único enviado ao seu WhatsApp, regras de acesso linha a linha no banco (cada barbearia só alcança os próprios dados), fotos em armazenamento privado, testes automáticos de segurança a cada mudança e registro de acessos. Nenhum sistema é 100% imune; se um incidente colocar você em risco, avisaremos você e a ANPD como manda a lei.",
      ] },
      { h: "9. Crianças e adolescentes", p: ["O app é para maiores de 18 anos. O agendamento de menores deve ser feito pelo pai, mãe ou responsável."] },
      { h: "10. Mudanças", p: ["Mudanças importantes nesta política serão avisadas no app antes de valer."] },
    ],
  };
}

export function terms(lang: Lang, c: Company): LegalDoc {
  if (lang === "en") return {
    title: "Terms of Use", updated: `Last updated: ${c.updated}`,
    intro: `These terms govern the use of Navalha, provided by ${c.name} (${c.id}, ${c.address}). By using the app you agree to them and to our Privacy Policy.`,
    sections: [
      { h: "1. The service", p: ["Navalha is software for barbershops and salons: online booking, schedule, customers, plans, finance, commissions and messages. Customers use it to book with a barbershop; barbershops subscribe to manage their business."] },
      { h: "2. Accounts", p: ["Login is by a one-time code sent to your WhatsApp. Keep your phone secure: whoever has it can sign in. Barbershop owners are responsible for who they give staff access to and at which level."] },
      { h: "3. Barbershop responsibilities", p: [
        "The barbershop is the controller of its customers' data and must use Navalha lawfully: inform customers, keep data accurate, only send promotional messages to those who agreed, and answer customer requests.",
        `${c.name} processes that data only to provide the service, under confidentiality, with security measures, and will help the barbershop meet data subject requests and report incidents (data processing terms under LGPD art. 39 and GDPR art. 28).`,
      ] },
      { h: "4. Acceptable use", p: ["Do not use the app for illegal activity, spam, attempts to access other barbershops' data, or to overload or reverse-engineer the service."] },
      { h: "5. Prices and cancellation", p: ["Barbershop subscription prices are shown at sign-up. You can cancel at any time; access continues until the end of the paid period. Before closing an account you can export your data. Consumer rights under local law (including the right of withdrawal) are preserved."] },
      { h: "6. Availability", p: ["We work to keep Navalha online and secure, with backups and monitoring, but we cannot guarantee uninterrupted operation or that the service is free of every error."] },
      { h: "7. Liability", p: ["To the extent permitted by law, our liability is limited to the amount paid for the service in the last 12 months. Nothing here limits liability that cannot be limited by law, including consumer protection rules."] },
      { h: "8. Changes and law", p: ["We will notify relevant changes in advance. These terms are governed by Brazilian law; consumers in the European Union keep the mandatory protections of their country of residence."] },
      { h: "9. Contact", p: [c.email] },
    ],
  };
  if (lang === "es") return {
    title: "Términos de uso", updated: `Actualizados el ${c.updated}`,
    intro: `Estos términos regulan el uso de Navalha, ofrecido por ${c.name} (${c.id}, ${c.address}). Al usar la app aceptas estos términos y nuestra Política de privacidad.`,
    sections: [
      { h: "1. El servicio", p: ["Navalha es un software para barberías y salones: reservas en línea, agenda, clientes, planes, finanzas, comisiones y mensajes. Los clientes lo usan para reservar; las barberías se suscriben para gestionar su negocio."] },
      { h: "2. Cuentas", p: ["El acceso es con un código de un solo uso enviado a tu WhatsApp. Protege tu teléfono: quien lo tenga puede entrar. El dueño de la barbería responde por a quién da acceso y con qué nivel."] },
      { h: "3. Responsabilidades de la barbería", p: [
        "La barbería es responsable de los datos de sus clientes y debe usar Navalha conforme a la ley: informar a los clientes, mantener los datos correctos, enviar promociones solo a quien aceptó y atender las solicitudes de los clientes.",
        `${c.name} trata esos datos solo para prestar el servicio, con confidencialidad y medidas de seguridad, y ayuda a la barbería a atender solicitudes y comunicar incidentes (encargo de tratamiento según LGPD art. 39 y RGPD art. 28).`,
      ] },
      { h: "4. Uso aceptable", p: ["No uses la app para actividades ilegales, spam, intentar acceder a datos de otras barberías, sobrecargar el servicio o hacer ingeniería inversa."] },
      { h: "5. Precios y cancelación", p: ["Los precios de suscripción se muestran al registrarse. Puedes cancelar cuando quieras; el acceso sigue hasta el fin del período pagado. Antes de cerrar la cuenta puedes exportar tus datos. Se respetan los derechos del consumidor de la ley local (incluido el desistimiento)."] },
      { h: "6. Disponibilidad", p: ["Trabajamos para mantener Navalha en línea y seguro, con copias de seguridad y monitoreo, pero no podemos garantizar funcionamiento ininterrumpido ni ausencia total de errores."] },
      { h: "7. Responsabilidad", p: ["En la medida permitida por la ley, nuestra responsabilidad se limita al importe pagado en los últimos 12 meses. Nada limita la responsabilidad que la ley no permite limitar, incluidas las normas de consumo."] },
      { h: "8. Cambios y ley aplicable", p: ["Avisaremos con antelación los cambios relevantes. Se aplica la ley brasileña; los consumidores de la Unión Europea mantienen las protecciones obligatorias de su país de residencia."] },
      { h: "9. Contacto", p: [c.email] },
    ],
  };
  return {
    title: "Termos de uso", updated: `Atualizados em ${c.updated.split("-").reverse().join("/")}`,
    intro: `Estes termos valem para o uso do Navalha, fornecido por ${c.name} (${c.id}, ${c.address}). Ao usar o app você concorda com eles e com a nossa Política de privacidade.`,
    sections: [
      { h: "1. O serviço", p: ["O Navalha é um sistema para barbearias e salões: agendamento online, agenda, clientes, planos, financeiro, comissões e mensagens. O cliente usa para agendar na barbearia; a barbearia assina para gerenciar o negócio."] },
      { h: "2. Contas", p: ["O login é por código de uso único enviado ao seu WhatsApp. Proteja o seu celular: quem estiver com ele consegue entrar. O dono da barbearia responde por quem ele dá acesso e em qual nível."] },
      { h: "3. Responsabilidades da barbearia", p: [
        "A barbearia é a controladora dos dados dos seus clientes e deve usar o Navalha conforme a lei: informar os clientes, manter os dados corretos, mandar promoções só para quem aceitou e atender os pedidos dos clientes.",
        `${c.name} trata esses dados só para prestar o serviço, com sigilo e medidas de segurança, e ajuda a barbearia a atender os pedidos dos titulares e a comunicar incidentes (papel de operador, LGPD art. 39 e GDPR art. 28).`,
      ] },
      { h: "4. Uso permitido", p: ["É proibido usar o app para atividades ilegais, spam, tentar acessar dados de outras barbearias, sobrecarregar o serviço ou copiar o sistema."] },
      { h: "5. Preço e cancelamento", p: ["O preço da assinatura da barbearia aparece na contratação. Dá para cancelar quando quiser; o acesso continua até o fim do período pago. Antes de encerrar a conta, você pode exportar os seus dados. Os direitos do consumidor (inclusive o arrependimento em 7 dias, CDC art. 49) continuam valendo."] },
      { h: "6. Disponibilidade", p: ["Trabalhamos para manter o Navalha no ar e seguro, com cópias de segurança e monitoramento, mas não é possível garantir funcionamento sem nenhuma interrupção ou sem nenhum erro."] },
      { h: "7. Responsabilidade", p: ["No limite permitido pela lei, a nossa responsabilidade fica limitada ao valor pago pelo serviço nos últimos 12 meses. Nada aqui limita o que a lei não deixa limitar, incluindo o Código de Defesa do Consumidor."] },
      { h: "8. Mudanças e lei aplicável", p: ["Mudanças importantes serão avisadas com antecedência. Vale a lei brasileira; consumidores na União Europeia mantêm as proteções obrigatórias do país onde moram."] },
      { h: "9. Contato", p: [c.email] },
    ],
  };
}
