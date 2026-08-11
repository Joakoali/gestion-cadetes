import { test, expect, Page } from '@playwright/test';

function uniquePhone(prefix: string): string {
  return `+549343${prefix}${Date.now().toString().slice(-6)}`;
}

async function clickMapCenter(page: Page) {
  const map = page.getByRole('application').or(page.locator('.leaflet-container')).first();
  await map.click();
}

test('mostrador creates a customer, assigns it, cadete completes it, rating reflects on the ficha', async ({
  browser,
}) => {
  const mostradorContext = await browser.newContext();
  const mostradorPage = await mostradorContext.newPage();
  const cadeteContext = await browser.newContext();
  const cadetePage = await cadeteContext.newPage();

  // 1. Owner registers and creates their tenant.
  await mostradorPage.goto('/registro');
  await mostradorPage.getByLabel('Nombre').fill('Ana Mostrador');
  await mostradorPage.getByLabel('Teléfono').fill(uniquePhone('1'));
  await mostradorPage.getByLabel('Contraseña').fill('secret123');
  await mostradorPage.getByRole('button', { name: /crear cuenta/i }).click();

  await mostradorPage.waitForURL('**/perfil');
  await mostradorPage.getByRole('link', { name: '¿Tenés un negocio? Creá tu cuenta acá' }).click();
  await mostradorPage.getByLabel('Nombre del negocio').fill('Rotisería Don José E2E');
  await mostradorPage.getByRole('button', { name: /crear negocio/i }).click();

  await mostradorPage.waitForURL('**/clientes?tenantId=*');
  const tenantId = new URL(mostradorPage.url()).searchParams.get('tenantId') as string;

  // 2. Owner invites a cadete.
  await mostradorPage.goto(`/admin?tenantId=${tenantId}`);
  await mostradorPage.getByLabel('Nombre (para identificarlo en la lista)').fill('Cadete E2E');
  await mostradorPage.getByRole('button', { name: /generar invitación/i }).click();
  const inviteUrl = await mostradorPage.getByLabel('Mandale este link por WhatsApp').inputValue();

  // 3. Cadete accepts the invite in a separate browser context.
  await cadetePage.goto(inviteUrl.replace('http://localhost:3000', ''));
  await cadetePage.getByLabel('Nombre').fill('Juan Cadete');
  await cadetePage.getByLabel('Teléfono').fill(uniquePhone('2'));
  await cadetePage.getByLabel('Contraseña').fill('secret123');
  await cadetePage.getByRole('button', { name: /crear cuenta/i }).click();
  await cadetePage.waitForURL('**/entregas?tenantId=*');
  await expect(cadetePage.getByText(/no tenés entregas asignadas/i)).toBeVisible();

  // 4. Mostrador creates a customer manually.
  await mostradorPage.goto(`/clientes?tenantId=${tenantId}`);
  await mostradorPage.getByRole('button', { name: /nuevo cliente/i }).click();
  await mostradorPage.getByRole('button', { name: /cargar a mano/i }).click();
  await mostradorPage.getByLabel('Nombre').fill('Carlos Cliente E2E');
  await mostradorPage.getByLabel('Teléfono').fill(uniquePhone('3'));
  await mostradorPage.getByLabel('Dirección').fill('Belgrano 456');
  await clickMapCenter(mostradorPage);
  await mostradorPage.getByRole('button', { name: /guardar cliente/i }).click();
  await mostradorPage.waitForURL('**/clientes/*');

  // 5. Mostrador assigns the delivery to the cadete.
  await mostradorPage.getByRole('button', { name: /asignar entrega/i }).click();
  await mostradorPage.getByRole('combobox').click();
  await mostradorPage.getByText('Juan Cadete').click();
  await mostradorPage.getByRole('button', { name: /^asignar$/i }).click();
  await expect(mostradorPage.getByRole('dialog')).not.toBeVisible();

  // 6. Cadete sees it in "mis entregas" and completes it with a rating.
  await cadetePage.reload();
  await cadetePage.getByRole('link', { name: /Carlos Cliente E2E/ }).click();
  await expect(cadetePage.getByText('Belgrano 456')).toBeVisible();
  await cadetePage.getByRole('button', { name: /completar/i }).click();
  await cadetePage.getByRole('button', { name: '4 estrellas' }).click();
  await cadetePage.getByRole('button', { name: /confirmar/i }).click();
  await cadetePage.waitForURL('**/entregas?tenantId=*');
  await expect(cadetePage.getByText(/no tenés entregas asignadas/i)).toBeVisible();

  // 7. Rating reflects on the customer's ficha for the mostrador.
  await mostradorPage.reload();
  await expect(mostradorPage.getByText(/4\.0/)).toBeVisible();
});
