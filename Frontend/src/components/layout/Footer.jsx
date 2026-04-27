import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Mail } from 'lucide-react';

const Footer = () => (
  <footer className="bg-gray-50 dark:bg-zinc-900 border-t border-gray-200 dark:border-white/5 mt-auto">
    <div className="max-w-7xl mx-auto px-6 py-14">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

        {/* Company Info */}
        <div className="space-y-3">
          <span className="text-xl font-black tracking-tighter text-gray-900 dark:text-zinc-100">
            PRONOUN<span className="text-accent">.</span>
          </span>
          <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed">
            Premium wholesale clothing for modern retail. Built for serious B2B buyers across India.
          </p>
        </div>

        {/* Quick Links */}
        <div className="space-y-4">
          <h4 className="text-gray-900 dark:text-zinc-100 text-xs font-black uppercase tracking-widest">Quick Links</h4>
          <ul className="space-y-2.5">
            {[
              { to: '/catalog',   label: 'Browse Catalog'  },
              { to: '/cart',      label: 'Cart'            },
              { to: '/dashboard', label: 'Dashboard'       },
              { to: '/history',   label: 'Order History'   },
              { to: '/about',     label: 'About Us'        },
              { to: '/contact',   label: 'Contact'         },
            ].map(({ to, label }) => (
              <li key={to}>
                <Link to={to} className="text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent text-sm transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div className="space-y-4">
          <h4 className="text-gray-900 dark:text-zinc-100 text-xs font-black uppercase tracking-widest">Legal</h4>
          <ul className="space-y-2.5">
            {[
              { to: '/terms',   label: 'Terms & Conditions' },
              { to: '/privacy', label: 'Privacy Policy'     },
              { to: '/refund',  label: 'Refund Policy'      },
            ].map(({ to, label }) => (
              <li key={to}>
                <Link to={to} className="text-gray-500 dark:text-zinc-400 hover:text-accent dark:hover:text-accent text-sm transition-colors">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Contact */}
        <div className="space-y-4">
          <h4 className="text-gray-900 dark:text-zinc-100 text-xs font-black uppercase tracking-widest">Contact</h4>
          <ul className="space-y-3">
            <li className="flex items-start gap-2.5 text-sm text-gray-500 dark:text-zinc-400">
              <MapPin className="w-4 h-4 text-accent mt-0.5 shrink-0" />
              Pronoun Jeans, Ahmedabad, Gujarat — 380001
            </li>
            <li>
              <a href="tel:+919876543210" className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-accent transition-colors">
                <Phone className="w-4 h-4 text-accent shrink-0" />
                +91 98765 43210
              </a>
            </li>
            <li>
              <a href="mailto:wholesale@pronoun.in" className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-zinc-400 hover:text-accent transition-colors">
                <Mail className="w-4 h-4 text-accent shrink-0" />
                wholesale@pronoun.in
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-gray-400 dark:text-zinc-600 text-xs">© {new Date().getFullYear()} Pronoun Jeans. All rights reserved.</p>
        <p className="text-gray-400 dark:text-zinc-600 text-xs">B2B Wholesale Portal · Authorised Partners Only</p>
      </div>
    </div>
  </footer>
);

export default Footer;