// The four legal pages, as data.
//
// Source documents, supplied by the client and dated 17 November 2026:
//   TERMS & CONDITIONS.txt
//   PRIVACY POLICY.txt
//   REFUND, RETURN & EXCHANGE POLICY.txt
//
// Every clause below is the client's wording, verbatim. What was done to it,
// and nothing else:
//   - hyphen bullets became `list` with listType 'ul', numbered conditions
//     'ol', and headings got `id` anchors;
//   - the business name, brand, address, phone, email and website are read
//     from BUSINESS instead of being retyped, so the legal pages cannot state
//     a different address from the contact page;
//   - the ® goes through mark().
//
// No sentence was reworded, shortened, merged or improved, including the ones
// that read awkwardly. If a promise in here contradicts the code, the promise
// stays and the contradiction gets reported — it is the client's commitment to
// their buyers, not ours to tune.
//
// Shape:
//   { slug, title, lastUpdated, intro: [...], sections: [...], closing: [...] }
//   section: { id, heading, body?, list?, listType?, after?, subsections?,
//              contactRows?, intro? }
//   A paragraph is a string, or { text, linkText, href } to linkify one phrase
//   inside it without reordering the sentence.

import { ASSUMPTIONS as A } from './assumptions.js';
import { BUSINESS, mark, formatPhone } from './seoContent.js';

const PRO_NOUN = mark(BUSINESS.brand);
const BRAND_SIGNOFF = `${PRO_NOUN} | Where Style Meets Comfort`;

// From the Privacy Policy's "About Us" block.
const BUSINESS_TYPE = "Men's Bottom-Wear Manufacturing and Wholesale";

const host = (siteUrl) => siteUrl.replace(/^https?:\/\//, '');

// ── D2: one date helper, read by all four pages ────────────────────────────
//
// The drafts say "17 November 2026". They were not published that day, so the
// pages carry ASSUMPTIONS.legalLastUpdated instead — one value, one format.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function legalLastUpdatedLabel(iso = A.legalLastUpdated) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// ── Terms & Conditions ──────────────────────────────────────────────────────

function termsPage(siteUrl) {
  return {
    slug: 'terms',
    title: 'Terms & Conditions',
    description: `Wholesale terms for ${BUSINESS.brand} men's bottom-wear: B2B size-set orders, `
      + 'pricing, payment, shipping, exchanges and cancellation.',
    lastUpdated: legalLastUpdatedLabel(),
    intro: [
      `Welcome to ${host(siteUrl)}, operated by ${BUSINESS.legalName}, ${BUSINESS.locality}, `
      + `${BUSINESS.region}, India. ${PRO_NOUN} is our men's bottom-wear brand.`,
      'By accessing our website, registering an account, placing an order or purchasing products '
      + 'from us, you agree to these Terms & Conditions. Please read them carefully before placing '
      + 'an order.',
    ],
    sections: [
      {
        id: 'about-our-business',
        heading: 'About Our Business',
        body: [
          `${PRO_NOUN} is a men's bottom-wear brand dealing in manufacturing and wholesale supply `
          + 'of garments, including cargo pants, casual trousers, formal trousers, track pants, '
          + 'shorts, capris, lounge wear and other related products.',
          'Our website is primarily intended for retailers, wholesalers, shopkeepers, distributors, '
          + 'multi-brand outlets and other business buyers.',
        ],
      },
      {
        id: 'business-to-business-sales',
        heading: 'Business-to-Business Sales',
        listType: 'ul',
        list: [
          'We primarily accept wholesale and business orders.',
          'We do not offer individual single-piece retail sales.',
          'Products are generally supplied in ready-made size sets as mentioned in the product listing.',
          'The minimum order quantity is one complete size set per design, unless otherwise specified.',
          'Buyers are responsible for checking the size set, quantity, product details and pricing before placing an order.',
        ],
      },
      {
        id: 'product-information',
        heading: 'Product Information',
        body: [
          'We make reasonable efforts to display accurate product descriptions, images, colours, '
          + 'fabrics, sizes and other specifications.',
          'However, slight variations in colour, texture or appearance may occur due to lighting, '
          + 'photography, fabric batches or screen settings.',
          'Buyers should carefully review the product details before confirming an order.',
        ],
      },
      {
        id: 'pricing-and-taxes',
        heading: 'Pricing and Taxes',
        listType: 'ul',
        list: [
          'All product prices are displayed in Indian Rupees (INR).',
          'Applicable GST and other statutory charges will be charged as per prevailing law and shown in the invoice, wherever applicable.',
          'Prices may change without prior notice.',
          'The price applicable to an order will be the price confirmed at the time of order acceptance.',
          'Any promotional discount or special offer will apply only according to its stated terms.',
        ],
      },
      {
        id: 'order-placement-and-confirmation',
        heading: 'Order Placement and Confirmation',
        listType: 'ul',
        list: [
          'Orders may be placed through our website or other authorised business communication channels.',
          'An order is considered confirmed only after acceptance by our team.',
          'We reserve the right to contact buyers to verify order details, stock availability, payment information or delivery details.',
          'If a product becomes unavailable, we may inform the buyer and discuss an alternative or cancellation.',
          'Buyers must provide accurate billing, shipping and contact information.',
        ],
      },
      {
        id: 'payment-terms',
        heading: 'Payment Terms',
        listType: 'ul',
        list: [
          'Payments must be made through the payment methods made available or approved by us.',
          'For Cash on Delivery (COD) orders, a 10% advance token may be required for order confirmation.',
          'For prepaid orders, payment must be received before dispatch unless otherwise agreed in writing.',
          'Orders may be held or cancelled if the required payment is not received.',
          'Buyers are responsible for ensuring that payment details are correct.',
        ],
      },
      {
        id: 'shipping-and-delivery',
        heading: 'Shipping and Delivery',
        listType: 'ul',
        list: [
          'Shipping charges of ₹300 apply to orders below ₹15,000.',
          'Free shipping is available on orders of ₹15,000 or above.',
          'Delivery timelines are estimates and may vary depending on the destination, courier partner, weather, transport conditions and other circumstances.',
          'Buyers must provide a complete and accurate delivery address and contact number.',
          'Once an order is dispatched, tracking details may be shared where available.',
          'Any delivery issue should be reported to our customer support team promptly.',
        ],
        after: [
          {
            text: 'Shipping and delivery is also set out in our Shipping & Delivery Policy, which forms part of these Terms.',
            linkText: 'Shipping & Delivery Policy',
            href: '/shipping-policy',
          },
        ],
      },
      {
        id: 'two-day-exchange-policy',
        heading: 'Two-Day Exchange Policy',
        body: [
          "Our standard exchange policy is limited to wrong goods supplied against the buyer's "
          + 'confirmed order.',
          'The following conditions apply:',
        ],
        listType: 'ol',
        list: [
          'Buyers must report receipt of wrong goods within 2 calendar days from the date of delivery.',
          `The buyer must contact us at ${BUSINESS.email} or ${formatPhone(BUSINESS.phone)}.`,
          'The buyer must provide the order number or invoice number, clear photographs of the goods received and details of the discrepancy.',
          'The goods must remain unused, unwashed, unaltered and in their original condition, with original tags and packaging.',
          'Our team will review the claim and confirm whether the goods supplied differ from the confirmed order.',
          'If the claim is approved, the exchange process and return-shipping arrangements will be communicated by our team.',
          'Replacement goods will be subject to stock availability. If the same goods are unavailable, our team will discuss an appropriate resolution with the buyer.',
        ],
        after: ['The following are not eligible for standard exchange:'],
      },
      {
        id: 'not-eligible-for-standard-exchange',
        heading: 'Not Eligible for Standard Exchange',
        listType: 'ul',
        list: [
          'Change of mind after order confirmation.',
          'Preference for another colour, design or style.',
          'Incorrect size selection by the buyer.',
          'Unsold stock or slow-moving products.',
          'Goods ordered correctly but no longer required by the buyer.',
          'Goods that have been used, washed, altered or damaged after delivery.',
        ],
        after: [
          'This standard exchange policy does not exclude remedies that may be available under '
          + 'applicable law for defective, deficient, spurious or materially misdescribed goods.',
        ],
      },
      {
        id: 'wrong-defective-or-damaged-goods',
        heading: 'Wrong, Defective or Damaged Goods',
        body: [
          'Buyers should inspect their shipment upon delivery.',
          'If goods are received damaged, defective or materially different from the confirmed '
          + 'order or product description, the buyer should notify us promptly with the invoice '
          + 'number and supporting photographs.',
          'Such claims will be reviewed individually and handled in accordance with applicable law. '
          + 'We may request additional information or inspection of the goods before deciding the '
          + 'appropriate resolution.',
        ],
      },
      {
        id: 'order-cancellation',
        heading: 'Order Cancellation',
        listType: 'ul',
        list: [
          'Buyers should request cancellation before dispatch.',
          'Once an order has been packed or dispatched, cancellation may not be possible.',
          'Any approved cancellation or payment adjustment will be handled according to the order status and applicable law.',
          'Orders placed using incorrect or unverifiable details may be held or cancelled after verification.',
        ],
      },
      {
        id: 'buyer-responsibilities',
        heading: 'Buyer Responsibilities',
        body: ['Buyers are responsible for:'],
        listType: 'ul',
        list: [
          'Providing correct business, billing and delivery details.',
          'Checking product descriptions, size sets, quantities and prices before ordering.',
          'Making payments according to the agreed terms.',
          'Inspecting goods after delivery.',
          'Reporting wrong or damaged goods within the stated time.',
          'Keeping order invoices and relevant communication for reference.',
        ],
      },
      {
        id: 'intellectual-property',
        heading: 'Intellectual Property',
        body: [
          'All brand names, logos, product photographs, website content, designs, text and other '
          + `materials displayed on this website are owned by or used with permission by ${BUSINESS.legalName}.`,
          'No person may copy, reproduce, distribute or commercially use these materials without '
          + 'prior written permission.',
        ],
      },
      {
        id: 'website-use',
        heading: 'Website Use',
        body: ['Users agree not to:'],
        listType: 'ul',
        list: [
          'Provide false or misleading information.',
          'Attempt unauthorised access to the website or its systems.',
          'Interfere with website operations.',
          'Copy or misuse website content, product images or business information.',
          'Use the website for unlawful or fraudulent activities.',
        ],
        after: [
          'We reserve the right to restrict access where misuse or suspicious activity is identified.',
        ],
      },
      {
        id: 'limitation-of-liability',
        heading: 'Limitation of Liability',
        body: [
          `To the extent permitted by applicable law, ${BUSINESS.legalName} shall not be responsible `
          + 'for indirect or consequential losses arising from website interruptions, third-party '
          + 'service failures or circumstances beyond our reasonable control.',
          'Nothing in these Terms limits liability or remedies that cannot legally be excluded under '
          + 'applicable law.',
        ],
      },
      {
        id: 'privacy',
        heading: 'Privacy',
        body: [
          {
            text: 'Personal and business information submitted through our website will be handled '
              + 'in accordance with our Privacy Policy.',
            linkText: 'Privacy Policy',
            href: '/privacy-policy',
          },
          'Please review our Privacy Policy to understand how information is collected, used and protected.',
        ],
      },
      {
        id: 'changes-to-these-terms',
        heading: 'Changes to These Terms',
        body: [
          'We may update these Terms & Conditions from time to time. Any revised version will be '
          + 'published on this website with an updated date.',
          'Continued use of the website after changes are published will be subject to the revised '
          + 'terms, to the extent permitted by law.',
        ],
      },
      {
        id: 'governing-law-and-jurisdiction',
        heading: 'Governing Law and Jurisdiction',
        body: [
          'These Terms & Conditions shall be governed by the laws of India.',
          `Subject to applicable law, courts having jurisdiction in ${BUSINESS.locality}, `
          + `${BUSINESS.region}, India, shall have jurisdiction over disputes arising from these Terms.`,
        ],
      },
      {
        id: 'contact-information',
        heading: 'Contact Information',
        body: [
          'For order-related queries, exchange requests or other business assistance, please contact us:',
        ],
        contactRows: [
          { label: 'Business Name', key: 'legalName' },
          { label: 'Brand', key: 'brand' },
          { label: 'Address', key: 'address' },
          { label: 'Phone', key: 'phone' },
          { label: 'Email', key: 'email' },
          { label: 'Website', key: 'website' },
        ],
      },
    ],
    closing: [BRAND_SIGNOFF],
  };
}

// ── Privacy Policy (verbatim) ───────────────────────────────────────────────

function privacyPage(siteUrl) {
  return {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    description: `How ${BUSINESS.legalName} (${BUSINESS.brand}) collects, uses, shares and protects `
      + `business and order information on ${host(siteUrl)}.`,
    lastUpdated: legalLastUpdatedLabel(),
    intro: [
      `This Privacy Policy explains how ${BUSINESS.legalName}, operating under the brand name `
      + `${PRO_NOUN}, collects, uses, stores and shares information when you visit or use `
      + `${host(siteUrl)}.`,
      'We respect your privacy and are committed to handling your personal and business information '
      + 'responsibly.',
      'By using our website, registering an account, submitting an enquiry or placing an order, you '
      + 'acknowledge this Privacy Policy.',
    ],
    sections: [
      {
        id: 'about-us',
        heading: 'About Us',
        contactRows: [
          { label: 'Business Name', key: 'legalName' },
          { label: 'Brand Name', key: 'brand' },
          { label: 'Business Type', text: BUSINESS_TYPE },
          { label: 'Address', key: 'address' },
          { label: 'Website', key: 'website' },
          { label: 'Email', key: 'email' },
          { label: 'Phone', key: 'phone' },
        ],
        after: [
          'For privacy-related questions or requests, you may contact our Customer Support team '
          + 'using the details above.',
        ],
      },
      {
        id: 'information-we-collect',
        heading: 'Information We Collect',
        body: [
          'We may collect the following categories of information when you use our website or '
          + 'communicate with us.',
        ],
        subsections: [
          {
            id: 'business-and-contact-information',
            heading: 'A. Business and Contact Information',
            listType: 'ul',
            list: [
              'Name of the owner or authorised contact person',
              'Business, shop or company name',
              'Mobile number and email address',
              'Business and delivery address',
              'GSTIN and other business details, where provided',
              'Information submitted through registration or enquiry forms',
            ],
          },
          {
            id: 'order-and-transaction-information',
            heading: 'B. Order and Transaction Information',
            listType: 'ul',
            list: [
              'Products, designs, quantities and size sets ordered',
              'Order history and invoice details',
              'Billing and shipping information',
              'Payment status and transaction reference numbers',
              'Delivery and shipment details',
            ],
            after: [
              'We do not ask you to share your ATM PIN, UPI PIN, internet banking password or card '
              + 'security password with us.',
            ],
          },
          {
            id: 'website-and-technical-information',
            heading: 'C. Website and Technical Information',
            body: [
              'When you visit our website, certain technical information may be collected, such as:',
            ],
            listType: 'ul',
            list: [
              'IP address',
              'Browser and device information',
              'Pages visited and website interactions',
              'Date, time and duration of visits',
              'Cookies and similar technologies, where enabled',
            ],
          },
        ],
      },
      {
        id: 'how-we-use-your-information',
        heading: 'How We Use Your Information',
        body: ['We may use the information collected for the following purposes:'],
        listType: 'ul',
        list: [
          'To register and manage business accounts.',
          'To verify business and contact details.',
          'To respond to enquiries and product-related questions.',
          'To process, confirm and manage wholesale orders.',
          'To prepare invoices and maintain transaction records.',
          'To arrange packing, shipping and delivery.',
          'To communicate order updates, payment information and customer support responses.',
          'To manage exchange requests and order-related complaints.',
          'To prevent fraudulent transactions and unauthorised activities.',
          'To maintain business, tax and accounting records.',
          'To improve website performance and user experience.',
          'To meet applicable legal and regulatory requirements.',
          'To send promotional or marketing communications where permitted and, where required, with your consent.',
        ],
      },
      {
        id: 'sharing-of-information',
        heading: 'Sharing of Information',
        body: [
          'We do not sell or rent your personal information to third parties for their independent '
          + 'marketing purposes.',
          'We may share relevant information with service providers where reasonably necessary to '
          + 'operate our business, including:',
        ],
        listType: 'ul',
        list: [
          'Logistics and courier partners: For order dispatch, delivery and shipment tracking.',
          'Payment service providers: For processing payments and verifying transactions, including Razorpay where used for the relevant transaction.',
          'Website and technology providers: For website hosting, maintenance, security and technical support.',
          'Communication and customer support providers: To respond to enquiries and provide order-related updates.',
          'Professional advisers: Such as accountants, auditors or legal advisers where required.',
          'Government and regulatory authorities: Where disclosure is required by applicable law or a lawful request.',
        ],
        after: [
          'We aim to share only the information reasonably necessary for the relevant service or purpose.',
        ],
      },
      {
        id: 'cookies-and-website-technologies',
        heading: 'Cookies and Website Technologies',
        body: [
          'Our website may use cookies or similar technologies to support essential website '
          + 'functions, remember preferences, improve performance and understand website usage.',
          'You may be able to manage or disable cookies through your browser settings. However, '
          + 'disabling certain cookies may affect website functionality.',
          'Where required, we will seek consent before using non-essential cookies or similar '
          + 'technologies.',
        ],
      },
      {
        id: 'data-storage-and-security',
        heading: 'Data Storage and Security',
        body: [
          'We take reasonable measures to protect the information shared with us against '
          + 'unauthorised access, misuse, alteration, disclosure or loss.',
          'Access to business and customer information is intended to be limited to authorised '
          + 'persons and service providers who need it for legitimate business purposes.',
          'However, no website, electronic transmission or storage system can be guaranteed to be '
          + 'completely secure. We cannot guarantee absolute security of information transmitted '
          + 'over the internet.',
        ],
      },
      {
        id: 'data-retention',
        heading: 'Data Retention',
        body: [
          'We retain personal and business information only for as long as reasonably necessary for '
          + 'the purposes described in this Policy, including:',
        ],
        listType: 'ul',
        list: [
          'Managing business accounts and customer relationships.',
          'Processing orders, payments, shipments and exchanges.',
          'Maintaining invoices, accounting and tax records.',
          'Handling complaints, disputes and legal obligations.',
          'Protecting our legitimate business interests.',
        ],
        after: [
          'When information is no longer required, we will take reasonable steps to delete or '
          + 'anonymise it, subject to applicable legal retention requirements.',
        ],
      },
      {
        id: 'your-privacy-rights',
        heading: 'Your Privacy Rights',
        body: ['Subject to applicable law, you may contact us to request:'],
        listType: 'ul',
        list: [
          'Access to information relating to you.',
          'Correction of inaccurate or incomplete information.',
          'Updating of your contact or business details.',
          'Withdrawal of consent where processing is based on consent.',
          'Erasure of personal information where legally permissible.',
          'Assistance with a privacy-related grievance.',
        ],
        after: [
          `To make a request, email ${BUSINESS.email} with your name, registered mobile number or `
          + 'email address and a description of your request.',
          'We may need to verify your identity before acting on a request.',
          'Withdrawal of consent does not affect processing lawfully carried out before the '
          + 'withdrawal. Certain information may need to be retained where required by law.',
        ],
      },
      {
        id: 'marketing-communications',
        heading: 'Marketing Communications',
        body: [
          'We may send business updates, new product information, offers or promotional messages '
          + 'where permitted by law and, where required, with your consent.',
          'You may request to stop receiving promotional communications by using the unsubscribe '
          + 'option, where available, or by contacting us.',
          'Even after opting out of promotional messages, you may continue to receive essential '
          + 'communications relating to orders, payments, deliveries, invoices or customer support.',
        ],
      },
      {
        id: 'third-party-websites-and-services',
        heading: 'Third-Party Websites and Services',
        body: [
          'Our website may contain links to third-party websites, payment services or other '
          + 'external platforms.',
          'We do not control the privacy practices or content of those third-party services. Their '
          + 'use is subject to their own privacy policies and terms.',
          'We recommend reviewing the privacy policy of any third-party service before sharing '
          + 'information with it.',
        ],
      },
      {
        id: 'childrens-privacy',
        heading: "Children's Privacy",
        body: [
          'Our website and wholesale services are intended for business buyers and are not directed '
          + 'towards children.',
          'We do not knowingly seek to collect personal information from children. If we become '
          + 'aware that information has been collected from a child without the legally required '
          + 'authorisation, we will take appropriate steps in accordance with applicable law.',
        ],
      },
      {
        id: 'changes-to-this-privacy-policy',
        heading: 'Changes to This Privacy Policy',
        body: [
          'We may update this Privacy Policy from time to time to reflect changes in our business '
          + 'practices, website features or applicable laws.',
          'The revised version will be published on this page with an updated date.',
          'We encourage visitors and registered buyers to review this page periodically.',
        ],
      },
      {
        id: 'contact-and-privacy-grievances',
        heading: 'Contact and Privacy Grievances',
        body: [
          'For questions, corrections, privacy requests or complaints relating to your information, '
          + 'please contact:',
        ],
        contactRows: [
          { label: 'Privacy Contact', text: `Customer Support, ${BUSINESS.legalName}` },
          { label: 'Email', key: 'email' },
          { label: 'Phone', key: 'phone' },
          { label: 'Address', key: 'address' },
        ],
        after: [
          // E4: the "within 7 working days" commitment is published exactly as
          // the client wrote it. From 1 Jan 2027 the E-Commerce Amendment Rules
          // want a 48-hour acknowledgment and one-month redressal, but
          // tightening an operational SLA is the client's call, not ours.
          'Please include sufficient details to help us identify your account or enquiry. We aim to '
          + 'acknowledge and address privacy grievances within 7 working days, subject to '
          + 'verification and the nature of the request. Any applicable statutory response period '
          + 'will be followed.',
        ],
      },
    ],
    closing: [BUSINESS.legalName, BRAND_SIGNOFF, `${siteUrl}/`],
  };
}

// ── Refund, Return, Exchange & Cancellation Policy ──────────────────────────

function refundPage() {
  return {
    slug: 'refund-policy',
    title: 'Refund, Return, Exchange & Cancellation Policy',
    description: 'Damaged or wrong goods: claim within 2 calendar days of delivery with an '
      + 'unboxing video. Exchange-only policy, product availability and evidence rules.',
    lastUpdated: legalLastUpdatedLabel(),
    intro: [
      `At ${PRO_NOUN}, a brand of ${BUSINESS.legalName}, we take care to check and dispatch orders `
      + "as per the buyer's confirmed requirements.",
      'As we primarily deal in B2B wholesale garment sales, we follow a limited return and exchange '
      + 'policy. Please read the following conditions carefully before placing an order.',
    ],
    sections: [
      {
        id: 'eligible-cases',
        heading: 'Eligible Cases',
        body: ['We accept claims only in the following situations:'],
        listType: 'ul',
        list: [
          'Damaged Goods: Products received in damaged condition.',
          "Wrong Goods: Products received that do not match the buyer's confirmed order, such as a "
          + 'different design or product supplied.',
        ],
        after: ['Claims will be reviewed and verified by our team before approval.'],
      },
      {
        id: 'two-day-claim-period',
        heading: 'Two-Day Claim Period',
        listType: 'ul',
        list: [
          'Any claim for damaged or wrong goods must be reported within 2 calendar days from the '
          + 'date of delivery.',
          'Claims submitted after this period may not be accepted under our standard policy, subject to applicable law.',
          'Buyers must contact us through our official email or phone number.',
          'The buyer must provide the order number or invoice number along with the required evidence.',
        ],
      },
      {
        id: 'mandatory-parcel-opening-video',
        heading: 'Mandatory Parcel Opening Video',
        body: [
          'A clear parcel opening (unboxing) video is compulsory for all damage and wrong-goods claims.',
          'The following conditions apply:',
        ],
        listType: 'ul',
        list: [
          'Record the video while opening the original sealed parcel.',
          'The courier label and parcel condition should be clearly visible at the beginning.',
          'Record the opening process continuously without cuts, pauses or editing.',
          'Show the products received, including the damage or difference, clearly.',
          'Keep the original packaging, labels and invoice until the claim is resolved.',
        ],
        after: [
          'Photos alone may not be sufficient to verify a claim. Our team may request additional '
          + 'photographs or information if required.',
        ],
      },
      {
        id: 'exchange-only-policy',
        heading: 'Exchange-Only Policy',
        body: [
          'Our preferred resolution for approved claims is an exchange, not a cash refund.',
          'The following conditions apply:',
        ],
        listType: 'ol',
        list: [
          'Exchange is available only after our team verifies and approves the claim.',
          'If the same product is available in stock, we will arrange an exchange for the same product.',
          'The exchange must be for the same design, D. NO., fabric, colour and size set as originally ordered, wherever applicable.',
          'Exchange for another design, product, colour or different size set is not permitted under this standard policy.',
          'The original goods must be returned in unused, unwashed and unaltered condition, with their original tags and packaging, except where the damage itself makes this impossible.',
          'The returned goods may be inspected before an exchange is approved.',
          'Return and replacement shipping arrangements will be communicated by our team after claim approval.',
        ],
      },
      {
        id: 'product-availability',
        heading: 'Product Availability',
        listType: 'ul',
        list: [
          'Exchange is subject to the availability of the same product.',
          'If the same product is available, we will arrange its replacement after verification and return of the original goods, as applicable.',
          'If the same product is unavailable, we will inform the buyer and discuss the appropriate resolution in accordance with applicable law.',
          "We do not automatically substitute a different design or product without the buyer's agreement.",
        ],
      },
      {
        id: 'non-eligible-cases',
        heading: 'Non-Eligible Cases',
        body: ['The following are not covered under our standard exchange policy:'],
        listType: 'ul',
        list: [
          'Change of mind after order confirmation.',
          'Preference for another colour, design or style.',
          'Incorrect size or size-set selection by the buyer.',
          'Unsold or slow-moving stock.',
          'Goods ordered correctly but no longer required.',
          'Damage caused after delivery by improper handling, washing, alteration or use.',
          'Claims without the required order details and supporting evidence, subject to applicable law.',
        ],
      },
      {
        id: 'how-to-submit-an-exchange-claim',
        heading: 'How to Submit an Exchange Claim',
        body: ['Please follow these steps:'],
        listType: 'ol',
        list: [
          'Contact our team within 2 calendar days of delivery.',
          'Share your order number or invoice number.',
          'Share the mandatory continuous parcel opening video.',
          'Share clear photographs of the affected or incorrect goods.',
          'Wait for verification and approval from our team.',
          'Follow the return instructions provided by our team.',
        ],
        after: [
          'Please do not dispatch goods back without receiving return instructions from us.',
        ],
      },
      {
        id: 'refunds',
        heading: 'Refunds',
        body: [
          'Our standard policy is to resolve approved damaged-goods and wrong-goods claims through '
          + 'an exchange of the same product, subject to availability.',
          'We do not offer refunds for change of mind, buyer preference, unsold stock or correctly '
          + 'supplied goods.',
          'Where an exchange cannot be provided or a refund or other remedy is required under '
          + 'applicable law, the matter will be handled in accordance with applicable legal '
          + 'requirements.',
        ],
      },
      {
        id: 'contact-us',
        heading: 'Contact Us',
        body: [
          'For damaged-goods claims, wrong-goods claims or exchange requests, contact:',
        ],
        contactRows: [
          { label: 'Business Name', key: 'legalName' },
          { label: 'Brand', key: 'brand' },
          { label: 'Email', key: 'email' },
          { label: 'Phone', key: 'phone' },
          { label: 'Address', key: 'address' },
          { label: 'Website', key: 'website' },
        ],
      },
    ],
    closing: [BRAND_SIGNOFF],
  };
}

// ── Shipping & Delivery Policy ──────────────────────────────────────────────
//
// Its clauses are Terms & Conditions section 7, verbatim. The page exists
// because the Privacy Policy names Razorpay, and payment gateways require a
// distinct, publicly reachable shipping and delivery policy alongside Terms,
// Privacy, Refund/Cancellation and Contact. The one sentence that is not the
// client's is the framing line saying where the clauses come from — a
// standalone page needs it, and it makes no promise of its own.

function shippingPage() {
  const shipping = termsPage('https://example.invalid')
    .sections.find((s) => s.id === 'shipping-and-delivery');
  return {
    slug: 'shipping-policy',
    title: 'Shipping & Delivery Policy',
    description: 'Shipping charges, the free-shipping threshold and delivery timelines for '
      + `wholesale orders dispatched from ${BUSINESS.locality} across India.`,
    lastUpdated: legalLastUpdatedLabel(),
    intro: [
      'This Shipping & Delivery Policy forms part of our Terms & Conditions and sets out how '
      + 'wholesale orders are charged, dispatched and delivered.',
    ],
    sections: [
      {
        id: 'shipping-and-delivery',
        heading: 'Shipping and Delivery',
        listType: 'ul',
        // The same array the Terms render, not a second copy of it.
        list: shipping.list,
      },
      {
        id: 'contact-us',
        heading: 'Contact Us',
        body: ['For any delivery or dispatch question, contact our customer support team:'],
        contactRows: [
          { label: 'Business Name', key: 'legalName' },
          { label: 'Email', key: 'email' },
          { label: 'Phone', key: 'phone' },
          { label: 'Address', key: 'address' },
          { label: 'Website', key: 'website' },
        ],
      },
    ],
    closing: [BRAND_SIGNOFF],
  };
}

// ── The four pages ──────────────────────────────────────────────────────────

/** Values a contactRow `key` resolves to — all from BUSINESS, none retyped. */
export function contactValue(key, siteUrl) {
  switch (key) {
    case 'legalName': return { text: BUSINESS.legalName };
    case 'brand':     return { text: PRO_NOUN };
    case 'address':   return { text: BUSINESS.addressLines.join(', ') };
    case 'phone':     return { text: formatPhone(BUSINESS.phone), href: `tel:+91${BUSINESS.phone}` };
    case 'email':     return { text: BUSINESS.email, href: `mailto:${BUSINESS.email}` };
    case 'website':   return { text: host(siteUrl), href: `${siteUrl}/` };
    default:          return { text: '' };
  }
}

export const LEGAL_SLUGS = ['terms', 'privacy-policy', 'refund-policy', 'shipping-policy'];

export function legalPages(siteUrl) {
  return {
    terms: termsPage(siteUrl),
    'privacy-policy': privacyPage(siteUrl),
    'refund-policy': refundPage(siteUrl),
    'shipping-policy': shippingPage(siteUrl),
  };
}

export const legalPage = (slug, siteUrl) => legalPages(siteUrl)[slug] ?? null;
