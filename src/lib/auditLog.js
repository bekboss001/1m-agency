export async function logAction(supabase, action, entity, entityName, details = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      action,
      entity,
      entity_name: entityName || null,
      details,
    })
  } catch (_) {
    // never block the main action on logging failure
  }
}
