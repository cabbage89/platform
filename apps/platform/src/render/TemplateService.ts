import { PageParams } from '../core/searchParams'
import Template, { TemplateParams, TemplateType, TemplateUpdateParams } from './Template'
import { partialMatchLocale, pick, prune } from '../utilities'
import { Variables } from '.'
import { loadEmailChannel } from '../providers/email'
import { getCampaign } from '../campaigns/CampaignService'
import { User } from '../users/User'
import { UserEvent } from '../users/UserEvent'
import { loadTextChannel } from '../providers/text'
import { RequestError } from '../core/errors'
import CampaignError from '../campaigns/CampaignError'
import { loadPushChannel } from '../providers/push'
import { getUserFromEmail, getUserFromPhone } from '../users/UserRepository'
import { loadWebhookChannel } from '../providers/webhook'
import Project from '../projects/Project'

export const pagedTemplates = async (params: PageParams, projectId: number) => {
    return await Template.search(
        params,
        qb => qb.where('project_id', projectId),
    )
}

export const allTemplates = async (projectId: number, campaignId?: number): Promise<Template[]> => {
    return await Template.all(qb => {
        if (campaignId) {
            qb.where('campaign_id', campaignId)
        }
        return qb.where('project_id', projectId)
    })
}

export const getTemplate = async (id: number, projectId: number) => {
    return await Template.find(id, qb => qb.where('project_id', projectId))
}

export const createTemplate = async (projectId: number, params: TemplateParams) => {
    const template = await Template.insertAndFetch({
        ...params,
        data: params.data ?? {},
        project_id: projectId,
    })
    return template
}

export const updateTemplate = async (templateId: number, params: TemplateUpdateParams) => {
    const template = await Template.updateAndFetch(templateId, prune(params))
    return template
}

export const deleteTemplate = async (id: number, projectId: number) => {
    return await Template.delete(qb => qb.where('id', id).where('project_id', projectId))
}

export const duplicateTemplate = async (template: Template, campaignId: number) => {
    const params: Partial<Template> = pick(template, ['project_id', 'locale', 'type', 'data'])
    params.campaign_id = campaignId
    return await Template.insert(params)
}

export const screenshotHtml = (template: TemplateType) => {
    if (template.type === 'email') {
        return template.html
    } else if (template.type === 'text') {
        return template.text
    } else if (template.type === 'push') {
        return `${template.title}<br/>${template.body}`
    }
    return ''
}

export const validateTemplates = async (projectId: number, campaignId: number) => {
    const templates = await allTemplates(projectId, campaignId)
    for (const template of templates) {
        const [isValid, error] = template.map().validate()
        if (!isValid) throw error
    }
}

export const sendProof = async (template: TemplateType, variables: Variables, recipient: string) => {

    const campaign = await getCampaign(template.campaign_id, template.project_id)
    if (!campaign) throw new RequestError(CampaignError.CampaignDoesNotExist)
    const event = UserEvent.fromJson(variables.event || {})
    const context = {
        ...variables.context,
        campaign_id: template.campaign_id,
    }
    const projectId = template.project_id

    const user = (await getUserFromEmail(projectId, recipient))
        ?? (await getUserFromPhone(projectId, recipient))
        ?? User.fromJson({ ...variables.user, email: recipient, phone: recipient })
    user.data = { ...user?.data, ...variables.user }
    variables = { user, event, context }

    if (template.type === 'email') {
        const channel = await loadEmailChannel(campaign.provider_id, projectId)
        await channel?.send(template, variables)

    } else if (template.type === 'text') {
        const channel = await loadTextChannel(campaign.provider_id, projectId)
        await channel?.send(template, variables)

    } else if (template.type === 'push') {
        const channel = await loadPushChannel(campaign.provider_id, projectId)
        if (!user.id) throw new RequestError('Unable to find a user matching the criteria.')
        await channel?.send(template, variables)

    } else if (template.type === 'webhook') {
        const channel = await loadWebhookChannel(campaign.provider_id, projectId)
        await channel?.send(template, variables)
    } else {
        throw new RequestError('Sending template proofs is only supported for email and text message types as this time.')
    }
}

// Determine what template to send to the user based on the following:
// - Find an exact match of users locale with a template
// - Find a partial match (same root locale i.e. `en` vs `en-US`)
// - If a project locale is set and there is match, use that template
// - If there is a project locale and its a partial match, use
// - Otherwise return any template available
export const templateInUserLocale = (templates: Template[], project?: Project, user?: User) => {
    return templates.find(item => item.locale === user?.locale)
        || templates.find(item => partialMatchLocale(item.locale, user?.locale))
        || templates.find(item => item.locale === project?.locale)
        || templates.find(item => partialMatchLocale(item.locale, project?.locale))
        || templates[0]
}
