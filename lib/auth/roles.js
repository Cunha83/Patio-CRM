'use strict';

/**
 * Pátio CRM — Matriz de Permissões e Perfis Canônicos RBAC
 * Submódulo extraído de lib/auth/userRepository.js (< 100 linhas)
 */


const ROLE_PERMISSIONS = {
  platform_admin: ['platform:read', 'platform:manage', '*'],
  platform_support: ['platform:read', 'platform:support'],
  tenant_admin: [
    'os:read', 'os:write', 'os:delete', 'admin:settings', 'whatsapp:admin',
    'reports:read', 'financial:read', 'financial:write', 'operation:read', 'operation:manage',
    'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write', 'quotation:send',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write', 'purchase:approve',
    'supplier:read', 'supplier:write', 'labor:read', 'labor:write', 'labor:adjust',
    'productivity:read', 'productivity:manage', 'costing:read', 'pricing:read', 'pricing:recommend', 'pricing:override',
    'profitability:read', 'crm:read', 'crm:write', 'crm:contact', 'maintenance:read', 'maintenance:write', 'maintenance:schedule',
    'appointments:read', 'appointments:write', 'company:settings', 'assistant:settings', 'backup:manage', 'erp:sync',
    'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings', '*'
  ],
  admin: [
    'os:read', 'os:write', 'os:delete', 'admin:settings', 'whatsapp:admin',
    'reports:read', 'financial:read', 'financial:write', 'operation:read', 'operation:manage',
    'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write', 'quotation:send',
    'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write', 'purchase:approve',
    'supplier:read', 'supplier:write', 'labor:read', 'labor:write', 'labor:adjust',
    'productivity:read', 'productivity:manage', 'costing:read', 'pricing:read', 'pricing:recommend', 'pricing:override',
    'profitability:read', 'crm:read', 'crm:write', 'crm:contact', 'maintenance:read', 'maintenance:write', 'maintenance:schedule',
    'appointments:read', 'appointments:write', 'company:settings', 'assistant:settings', 'backup:manage', 'erp:sync',
    'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings', '*'
  ],
  gerente: [
    'os:read', 'os:write', 'reports:read', 'operation:read', 'operation:manage',
    'inspection:read', 'inspection:write', 'quotation:read', 'quotation:write',
    'inventory:read', 'inventory:write', 'purchase:read', 'purchase:write',
    'supplier:read', 'labor:read', 'labor:write', 'productivity:read',
    'crm:read', 'crm:write', 'appointments:read', 'appointments:write',
    'fiscal:read', 'fiscal:write'
  ],
  atendente: [
    'os:read', 'os:write', 'operation:read', 'crm:read', 'crm:write', 'crm:contact',
    'appointments:read', 'appointments:write', 'quotation:read', 'quotation:write', 'quotation:send'
  ],
  consultor: [
    'os:read', 'os:write', 'operation:read', 'crm:read', 'crm:write', 'crm:contact',
    'appointments:read', 'appointments:write', 'quotation:read', 'quotation:write', 'quotation:send'
  ],
  mecanico: [
    'patio:read', 'patio:write', 'os:read', 'inspection:read', 'inspection:write', 'labor:read', 'labor:write', 'inventory:read'
  ],
  vendedor: [
    'os:read', 'os:write', 'patio:read', 'patio:write',
    'sales:read', 'sales:write', 'client:read', 'client:write',
    'inventory:read', 'quotation:read', 'quotation:write'
  ],
  caixa: [
    'dashboard:read', 'financial:read', 'financial:write',
    'pix:read', 'pix:write', 'purchase:read', 'purchase:write',
    'sales:read', 'fiscal:read', 'fiscal:write'
  ],
  estoquista: [
    'inventory:read', 'inventory:write', 'inventory:adjust', 'purchase:read', 'purchase:write',
    'supplier:read', 'supplier:write'
  ],
  compras: [
    'inventory:read', 'purchase:read', 'purchase:write', 'supplier:read', 'supplier:write'
  ],
  financeiro: [
    'financial:read', 'financial:write', 'reports:read', 'profitability:read',
    'fiscal:read', 'fiscal:write', 'fiscal:cancel', 'fiscal:settings'
  ]
};


module.exports = {
  ROLE_PERMISSIONS
};
