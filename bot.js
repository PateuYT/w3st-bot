require('dotenv').config();
const { Client, GatewayIntentBits, Events, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Generează cheie random W3ST-XXXX-XXXX-XXXX
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segment = () => Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `W3ST-${segment()}-${segment()}-${segment()}`;
}

// Comenzi Slash
const commands = [
    new SlashCommandBuilder()
        .setName('generate')
        .setDescription('Generează o cheie de licență W3ST')
        .addIntegerOption(option => 
            option.setName('days')
                .setDescription('Număr de zile (default: 30)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(365))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('keys')
        .setDescription('Vezi toate cheile generate')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('revoke')
        .setDescription('Revocă o cheie')
        .addStringOption(option => 
            option.setName('key')
                .setDescription('Cheia de revocat')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// Deploy commands (rulează o singură dată)
client.once(Events.ClientReady, async () => {
    console.log(`Bot logat ca ${client.user.tag}`);
    
    try {
        await client.application.commands.set(commands);
        console.log('Comenzi înregistrate!');
    } catch (error) {
        console.error('Eroare la înregistrarea comenzilor:', error);
    }
});

// Handler comenzi
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

const { AttachmentBuilder } = require('discord.js');

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

const ALLOWED_ROLE_ID = '1474504134656004199';

// schimbă după tine
function generateKey() {
  // exemplu simplu: 5 grupe x 5 caractere
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part(5)}-${part(5)}-${part(5)}-${part(5)}-${part(5)}`;
}

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generează chei licență')
    .addIntegerOption(opt =>
      opt.setName('days')
        .setDescription('Durata în zile (7, 31, 91). Dacă nu e valid, se rotunjește.')
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('count')
        .setDescription('Câte chei să genereze')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)
    ),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  async execute(interaction, supabase) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Comanda poate fi folosită doar pe server!', ephemeral: true });
    }

    // verificare rol
    let member;
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch {
      return interaction.reply({ content: '❌ Eroare la verificarea rolului!', ephemeral: true });
    }

    if (!member.roles.cache.has(ALLOWED_ROLE_ID)) {
      return interaction.reply({ content: '❌ Nu ai rolul necesar pentru a genera chei!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // days: 7,31,91 (rotunjire la cea mai apropiată)
    const durationOptions = [7, 31, 91];
    let days = interaction.options.getInteger('days') ?? 7;

    if (!durationOptions.includes(days)) {
      days = durationOptions.reduce((prev, curr) =>
        Math.abs(curr - days) < Math.abs(prev - days) ? curr : prev
      );
    }

    // count
    const count = interaction.options.getInteger('count');
    if (!count || count < 1) {
      return interaction.editReply({ content: '❌ Număr invalid de chei!' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    // generează cheile
    const keys = Array.from({ length: count }, () => generateKey());

    // insert bulk supabase
    const rows = keys.map((k) => ({
      key: k,
      duration_days: days,
      expires_at: expiresAt.toISOString(),
      created_by: interaction.user.id
    }));

    const { error } = await supabase.from('license_keys').insert(rows);

    if (error) {
      console.error('❌ Supabase error:', error);
      return interaction.editReply({ content: `❌ Eroare la salvare: ${error.message}` });
    }

    // confirmare privată
    await interaction.editReply({ content: `✅ Am generat **${count}** chei și le-am trimis în canal!` });

    const header = `West Spoofer keys (${count}) | Duration: ${days} Days | Expires: ${formatDate(expiresAt)}\n`;

    // dacă >100 -> fișier .txt
    if (count > 100) {
      const content = header + keys.join('\n') + '\n';
      const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
        name: `keys_${count}_${days}days.txt`
      });

      await interaction.channel.send({
        content: `📄 Am generat **${count}** chei. Le găsești în fișierul atașat.\nExpires: **${formatDate(expiresAt)}**`,
        files: [file]
      });
    } else {
      // <= 100 -> mesaj (cu fallback dacă depășește limita)
      const body = keys.join('\n');
      const msg = `${header}\`\`\`\n${body}\n\`\`\``;

      if (msg.length > 1900) {
        const content = header + body + '\n';
        const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
          name: `keys_${count}_${days}days.txt`
        });

        await interaction.channel.send({
          content: `📄 Cheile sunt prea multe pentru un singur mesaj, le-am pus în fișier.\nExpires: **${formatDate(expiresAt)}**`,
          files: [file]
        });
      } else {
        await interaction.channel.send(msg);
      }
    }

    // log opțional (#license-logs)
    try {
      const logChannel = interaction.guild.channels.cache.find(c => c.name === 'license-logs');
      if (logChannel) {
        await logChannel.send({
          embeds: [{
            color: 0x22C55E,
            description: `✅ **${interaction.user.tag}** a generat **${count}** chei de **${days} zile**`
          }]
        });
      }
    } catch {}
  }
};
    
    // /keys
    if (interaction.commandName === 'keys') {
        await interaction.deferReply({ ephemeral: true });
        
        const { data: keys, error } = await supabase
            .from('license_keys')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (error || !keys.length) {
            return interaction.editReply('Nu există chei sau a apărut o eroare.');
        }

        const list = keys.map(k => {
            const status = k.used ? '🔴 Folosită' : '🟢 Liberă';
            return `\`${k.key}\` - ${k.duration_days}z - ${status}`;
        }).join('\n');

        await interaction.editReply({
            embeds: [{
                color: 0x3B82F6,
                title: '📋 Ultimele 10 chei',
                description: list,
                timestamp: new Date()
            }]
        });
    }

    // /revoke
    if (interaction.commandName === 'revoke') {
        const key = interaction.options.getString('key').toUpperCase();
        
        const { error } = await supabase
            .from('license_keys')
            .delete()
            .eq('key', key);

        if (error) {
            return interaction.reply({ content: '❌ Eroare la ștergere!', ephemeral: true });
        }

        await interaction.reply({ 
            content: `✅ Cheia \`${key}\` a fost revocată!`, 
            ephemeral: true 
        });
    }
});

client.login(process.env.DISCORD_TOKEN);
