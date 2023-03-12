import { useContext } from 'react'
import api from '../../api'
import { ProjectContext } from '../../contexts'
import { Project } from '../../types'
import TextField from '../../ui/form/TextField'
import FormWrapper from '../../ui/form/FormWrapper'
import Heading from '../../ui/Heading'
import { toast } from 'react-hot-toast'

export default function ProjectSettings() {
    const [project, setProject] = useContext(ProjectContext)

    return (
        <>
            <Heading size="h3" title="General" />
            <FormWrapper<Project>
                onSubmit={async ({ name, description, locale, timezone }) => {
                    const value = await api.projects.update(project.id, { name, description, locale, timezone })
                    setProject(value)
                    toast.success('Saved project settings')
                }}
                defaultValues={project}
                submitLabel="Save"
            >
                {
                    form => (
                        <>
                            <TextField form={form} name="name" required />
                            <TextField form={form} name="description" textarea />
                            <TextField form={form}
                                name="locale"
                                label="Default Locale"
                                subtitle="This locale will be used as the default when creating campaigns and when a users locale does not match any available ones."
                                required
                            />
                            <TextField form={form}
                                name="timezone"
                                label="Timezone"
                                required
                            />
                        </>
                    )
                }
            </FormWrapper>
        </>
    )
}
